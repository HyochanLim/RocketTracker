from __future__ import annotations

from dataclasses import dataclass, field
from math import atan2, cos, hypot, radians, sin
from typing import Dict, Iterable, List, Optional

import numpy as np


@dataclass
class FilterConfig:
    gravity_world: np.ndarray = field(
        default_factory=lambda: np.array([9.80665, 0.0, 0.0], dtype=float)
    )

    # Process noise (roughly aligned to EKF-style tuning terms)
    gyro_noise: float = 0.03
    accel_noise: float = 0.8
    gyro_bias_rw: float = 0.0008
    accel_bias_rw: float = 0.01

    # Measurement noise
    gps_pos_noise: float = 1.2
    # Horizontal GPS speed (TeleMega `speed` + bearing); keep looser than raw pos-diff.
    gps_vel_noise: float = 8.0
    baro_pos_noise: float = 1.0

    innovation_gate_sigma: float = 5.0
    gps_pos_gate_sigma: float = 5.0
    # Allow large corrections when IMU velocity has drifted far from TeleMega ground speed.
    gps_vel_gate_sigma: float = 40.0
    baro_gate_sigma: float = 4.0
    max_hdop: float = 4.0

    # GPS horizontal velocity from TeleMega speed + track from successive fixes
    gps_vel_dt_min: float = 0.05
    gps_vel_dt_max: float = 5.0
    gps_vel_min_ground_m: float = 0.08
    zupt_speed_threshold: float = 8.0
    zupt_vel_var: float = 0.15**2
    # Direct blend of horizontal velocity toward TeleMega (avoids bad coupling into attitude).
    gps_speed_blend: float = 0.45


class MinimalNavFilter:
    """
    ArduPilot EKF3-like reduced error-state filter.

    This keeps the core EKF structure close to original architecture:
    - nominal states: quaternion, velocity, position, gyro bias, accel bias
    - error-state covariance: 15x15
    - predict from IMU, correct with GPS/baro
    """

    IDX_POS = slice(0, 3)
    IDX_VEL = slice(3, 6)
    IDX_ANG = slice(6, 9)
    IDX_GBIAS = slice(9, 12)
    IDX_ABIAS = slice(12, 15)

    def __init__(self, cfg: Optional[FilterConfig] = None) -> None:
        self.cfg = cfg or FilterConfig()
        self.reset()

    def reset(self) -> None:
        self.q = np.array([1.0, 0.0, 0.0, 0.0], dtype=float)
        self.pos = np.zeros(3, dtype=float)
        self.vel = np.zeros(3, dtype=float)
        self.gyro_bias = np.zeros(3, dtype=float)
        self.accel_bias = np.zeros(3, dtype=float)

        self.P = np.eye(15, dtype=float) * 0.2

        self.last_time: Optional[float] = None
        self.ref_lat: Optional[float] = None
        self.ref_lon: Optional[float] = None
        self.ref_alt: Optional[float] = None

        self.last_gps_pos_world: Optional[np.ndarray] = None
        self.last_gps_time: Optional[float] = None
        self.last_linear_accel_world = np.zeros(3, dtype=float)

        self._gps_ne_prev: Optional[tuple[float, float, float]] = None
        self._gps_track_rad: Optional[float] = None

    def process_sample(self, sample: Dict[str, float]) -> Dict[str, object]:
        t = float(sample.get("time", 0.0))
        dt = self._compute_dt(t)

        accel_body = np.array(
            [
                float(sample.get("accel_x", 0.0)),
                float(sample.get("accel_y", 0.0)),
                float(sample.get("accel_z", 0.0)),
            ],
            dtype=float,
        )
        gyro_deg = np.array(
            [
                float(sample.get("gyro_roll", 0.0)),
                float(sample.get("gyro_pitch", 0.0)),
                float(sample.get("gyro_yaw", 0.0)),
            ],
            dtype=float,
        )
        gyro_rad = np.deg2rad(gyro_deg)

        self._predict(gyro_rad, accel_body, dt)

        if self._has_valid_gps(sample):
            gps_pos_world = self._gps_to_world(sample)
            self._update_gps_pos(gps_pos_world)
            self._update_gps_vel_telemega(sample, gps_pos_world, t)

        baro_alt = _safe_float(sample.get("baro_altitude", sample.get("altitude")))
        if baro_alt is not None:
            try:
                if np.isfinite(baro_alt):
                    self._update_baro_height(baro_alt)
            except (TypeError, ValueError):
                pass

        self._maybe_zero_velocity(sample)

        rot = quat_to_rotmat(self.q)
        accel_body_linear = rot.T @ self.last_linear_accel_world

        return {
            "time": t,
            "quaternion": self.q.tolist(),
            "velocity": self.vel.tolist(),
            "speed": float(np.linalg.norm(self.vel)),
            "acceleration_world": self.last_linear_accel_world.tolist(),
            "acceleration_body": accel_body_linear.tolist(),
            "position_world": self.pos.tolist(),
        }

    def process_records(self, records: Iterable[Dict[str, float]]) -> List[Dict[str, object]]:
        return [self.process_sample(rec) for rec in records]

    def _compute_dt(self, t: float) -> float:
        if self.last_time is None:
            dt = 0.01
        else:
            dt = max(1e-3, min(0.1, t - self.last_time))
        self.last_time = t
        return dt

    def _predict(self, gyro_rad: np.ndarray, accel_body: np.ndarray, dt: float) -> None:
        omega = gyro_rad - self.gyro_bias
        dq = quat_from_omega(omega, dt)
        self.q = quat_normalize(quat_mul(self.q, dq))

        rot = quat_to_rotmat(self.q)
        accel_nav = rot @ (accel_body - self.accel_bias) - self.cfg.gravity_world
        self.last_linear_accel_world = accel_nav

        self.pos = self.pos + self.vel * dt + 0.5 * accel_nav * dt * dt
        self.vel = self.vel + accel_nav * dt

        F = np.zeros((15, 15), dtype=float)
        F[self.IDX_POS, self.IDX_VEL] = np.eye(3, dtype=float)
        F[self.IDX_VEL, self.IDX_ANG] = -rot @ skew(accel_body - self.accel_bias)
        F[self.IDX_VEL, self.IDX_ABIAS] = -rot
        F[self.IDX_ANG, self.IDX_GBIAS] = -np.eye(3, dtype=float)

        phi = np.eye(15, dtype=float) + F * dt

        q_gyro = self.cfg.gyro_noise * self.cfg.gyro_noise
        q_acc = self.cfg.accel_noise * self.cfg.accel_noise
        q_gbias = self.cfg.gyro_bias_rw * self.cfg.gyro_bias_rw
        q_abias = self.cfg.accel_bias_rw * self.cfg.accel_bias_rw

        qd = np.zeros((15, 15), dtype=float)
        qd[self.IDX_ANG, self.IDX_ANG] = np.eye(3, dtype=float) * q_gyro * dt
        qd[self.IDX_VEL, self.IDX_VEL] = np.eye(3, dtype=float) * q_acc * dt
        qd[self.IDX_GBIAS, self.IDX_GBIAS] = np.eye(3, dtype=float) * q_gbias * dt
        qd[self.IDX_ABIAS, self.IDX_ABIAS] = np.eye(3, dtype=float) * q_abias * dt

        self.P = phi @ self.P @ phi.T + qd
        self.P = 0.5 * (self.P + self.P.T)

    def _update_gps_pos(self, gps_pos_world: np.ndarray) -> None:
        for axis in range(3):
            h = np.zeros((1, 15), dtype=float)
            h[0, axis] = 1.0
            self._measurement_update(
                np.array([gps_pos_world[axis]], dtype=float),
                h,
                self.cfg.gps_pos_noise**2,
                self.cfg.gps_pos_gate_sigma,
            )

    def _update_gps_vel_telemega(self, sample: Dict[str, float], gps_pos_world: np.ndarray, t: float) -> None:
        """
        TeleMega logs ground speed but usually no course. Raw 3D position differencing at high rate
        blows up vertical velocity (noisy GPS alt) and corrupts the state. We use:
        - horizontal speed magnitude: abs(log speed) when present, else horizontal displacement / dt
        - bearing: from successive horizontal NE fixes when movement is large enough
        We do not inject vertical velocity from GPS position differencing.
        """
        east = float(gps_pos_world[1])
        north = float(gps_pos_world[2])
        spd_raw = _safe_float(sample.get("speed"))
        v_mag = abs(spd_raw) if spd_raw is not None else None

        if self._gps_ne_prev is not None:
            n0, e0, t0 = self._gps_ne_prev
            dt = t - t0
            if self.cfg.gps_vel_dt_min < dt < self.cfg.gps_vel_dt_max:
                dn = north - n0
                de = east - e0
                dist = hypot(dn, de)
                if dist >= self.cfg.gps_vel_min_ground_m:
                    self._gps_track_rad = atan2(de, dn)
                if self._gps_track_rad is not None:
                    if v_mag is None:
                        v_mag = dist / dt if dt > 1e-6 else None
                    if v_mag is not None:
                        tr = self._gps_track_rad
                        v_east = v_mag * sin(tr)
                        v_north = v_mag * cos(tr)
                        if v_mag < self.cfg.zupt_speed_threshold:
                            self.vel[0] = 0.0
                            self.vel[1] = v_east
                            self.vel[2] = v_north
                        else:
                            a = self.cfg.gps_speed_blend
                            self.vel[1] = (1.0 - a) * self.vel[1] + a * v_east
                            self.vel[2] = (1.0 - a) * self.vel[2] + a * v_north

        self._gps_ne_prev = (north, east, t)
        self.last_gps_pos_world = gps_pos_world.copy()
        self.last_gps_time = t

    def _maybe_zero_velocity(self, sample: Dict[str, float]) -> None:
        state = str(sample.get("state_name", "")).strip().lower()
        if state != "landed":
            return
        for axis in range(3):
            h = np.zeros((1, 15), dtype=float)
            h[0, 3 + axis] = 1.0
            self._measurement_update(
                np.array([0.0], dtype=float),
                h,
                self.cfg.zupt_vel_var,
                self.cfg.gps_vel_gate_sigma,
                skip_gate=True,
            )

    def _update_baro_height(self, baro_alt: float) -> None:
        if self.ref_alt is None:
            self.ref_alt = baro_alt
        z_x = baro_alt - self.ref_alt

        h = np.zeros((1, 15), dtype=float)
        h[0, 0] = 1.0
        self._measurement_update(
            np.array([z_x], dtype=float),
            h,
            self.cfg.baro_pos_noise**2,
            self.cfg.baro_gate_sigma,
        )

    def _measurement_update(
        self,
        z: np.ndarray,
        h: np.ndarray,
        r_scalar: float,
        gate_sigma: Optional[float] = None,
        skip_gate: bool = False,
    ) -> None:
        x_err = np.zeros(15, dtype=float)
        x_err[self.IDX_POS] = self.pos
        x_err[self.IDX_VEL] = self.vel

        y = z - h @ x_err
        s = h @ self.P @ h.T + np.array([[r_scalar]], dtype=float)
        s_val = float(s[0, 0])
        if s_val <= 1e-12:
            return

        if not skip_gate:
            effective_gate_sigma = self.cfg.innovation_gate_sigma if gate_sigma is None else gate_sigma
            gate = effective_gate_sigma * np.sqrt(s_val)
            if abs(float(y[0])) > gate:
                return

        k = self.P @ h.T / s_val
        dx = (k.flatten() * float(y[0]))

        self.pos += dx[self.IDX_POS]
        self.vel += dx[self.IDX_VEL]
        self.gyro_bias += dx[self.IDX_GBIAS]
        self.accel_bias += dx[self.IDX_ABIAS]

        dtheta = dx[self.IDX_ANG]
        dq = np.array([1.0, 0.5 * dtheta[0], 0.5 * dtheta[1], 0.5 * dtheta[2]], dtype=float)
        self.q = quat_normalize(quat_mul(self.q, dq))

        i_kh = np.eye(15, dtype=float) - k @ h
        self.P = i_kh @ self.P @ i_kh.T + (k @ k.T) * r_scalar
        self.P = 0.5 * (self.P + self.P.T)

    def _has_valid_gps(self, sample: Dict[str, float]) -> bool:
        nsat = int(sample.get("nsat", 0) or 0)
        if nsat < 5:
            return False
        hdop = _safe_float(sample.get("hdop"))
        if hdop is not None and hdop > self.cfg.max_hdop:
            return False

        lat = sample.get("latitude")
        lon = sample.get("longitude")
        if lat is None or lon is None:
            return False

        try:
            lat_f = float(lat)
            lon_f = float(lon)
        except (TypeError, ValueError):
            return False

        return np.isfinite(lat_f) and np.isfinite(lon_f)

    def _gps_to_world(self, sample: Dict[str, float]) -> np.ndarray:
        lat = float(sample["latitude"])
        lon = float(sample["longitude"])
        alt = float(sample.get("gps_altitude", sample.get("altitude.1", sample.get("altitude", 0.0))))

        if self.ref_lat is None:
            self.ref_lat = lat
            self.ref_lon = lon
            self.ref_alt = alt

        north, east = geodetic_to_local_m(lat, lon, self.ref_lat, self.ref_lon)
        up = alt - float(self.ref_alt)

        return np.array([up, east, north], dtype=float)

def geodetic_to_local_m(lat: float, lon: float, lat0: float, lon0: float) -> np.ndarray:
    r_earth = 6378137.0
    d_lat = radians(lat - lat0)
    d_lon = radians(lon - lon0)
    mean_lat = radians((lat + lat0) * 0.5)
    north = r_earth * d_lat
    east = r_earth * cos(mean_lat) * d_lon
    return np.array([north, east], dtype=float)


def skew(v: np.ndarray) -> np.ndarray:
    return np.array(
        [
            [0.0, -v[2], v[1]],
            [v[2], 0.0, -v[0]],
            [-v[1], v[0], 0.0],
        ],
        dtype=float,
    )


def quat_normalize(q: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(q)
    if n < 1e-12:
        return np.array([1.0, 0.0, 0.0, 0.0], dtype=float)
    return q / n


def quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return np.array(
        [
            aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
        ],
        dtype=float,
    )


def quat_from_omega(omega: np.ndarray, dt: float) -> np.ndarray:
    theta = np.linalg.norm(omega) * dt
    if theta < 1e-12:
        return np.array([1.0, 0.0, 0.0, 0.0], dtype=float)

    axis = omega / np.linalg.norm(omega)
    half = 0.5 * theta
    s = sin(half)
    return np.array([cos(half), axis[0] * s, axis[1] * s, axis[2] * s], dtype=float)


def quat_to_rotmat(q: np.ndarray) -> np.ndarray:
    w, x, y, z = quat_normalize(q)
    return np.array(
        [
            [1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y - w * z), 2.0 * (x * z + w * y)],
            [2.0 * (x * y + w * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z - w * x)],
            [2.0 * (x * z - w * y), 2.0 * (y * z + w * x), 1.0 - 2.0 * (x * x + y * y)],
        ],
        dtype=float,
    )


def _safe_float(value: object) -> Optional[float]:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if np.isfinite(f) else None
