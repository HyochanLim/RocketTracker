/* global Cesium */
/**
 * Declarative visualization layer: agent/LLM outputs result.vizCommands[]; this applies them to the viewer.
 * Entity ids are prefixed with "viz-" and cleared by op "clearOverlays". Core flight ids (launch-point, flight-trajectory-polyline) are untouched.
 */
(function () {
  var PREFIX = "viz-";

  function fullId(raw) {
    var s = String(raw == null ? "" : raw).trim() || "item";
    return s.indexOf(PREFIX) === 0 ? s : PREFIX + s;
  }

  function parseColor(c, fallbackHex) {
    var fb = fallbackHex || "#f6d365";
    try {
      if (!c) return Cesium.Color.fromCssColorString(fb);
      return Cesium.Color.fromCssColorString(String(c));
    } catch (e) {
      return Cesium.Color.fromCssColorString(fb);
    }
  }

  function removeVizPrefixed(viewer) {
    var toRemove = [];
    var vals = viewer.entities.values;
    for (var i = 0; i < vals.length; i += 1) {
      var e = vals[i];
      var id = e && e.id != null ? String(e.id) : "";
      if (id.indexOf(PREFIX) === 0) toRemove.push(e);
    }
    for (var j = 0; j < toRemove.length; j += 1) {
      viewer.entities.remove(toRemove[j]);
    }
  }

  function readPosition(cmd) {
    var lon = Number(cmd.lon);
    var lat = Number(cmd.lat);
    var h = cmd.heightM != null ? Number(cmd.heightM) : cmd.alt != null ? Number(cmd.alt) : 0;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    if (!Number.isFinite(h)) h = 0;
    return { lon: lon, lat: lat, h: h };
  }

  /**
   * @param {Cesium.Viewer} viewer
   * @param {object[]} commands
   * @returns {Promise<{applied:number, errors:string[]}>}
   */
  async function applyVizCommands(viewer, commands) {
    var errors = [];
    var applied = 0;
    if (!viewer || typeof Cesium === "undefined") {
      return { applied: 0, errors: ["no viewer"] };
    }
    if (!Array.isArray(commands)) {
      return { applied: 0, errors: ["vizCommands is not an array"] };
    }

    for (var i = 0; i < commands.length; i += 1) {
      var cmd = commands[i];
      if (!cmd || typeof cmd !== "object") continue;
      var op = String(cmd.op || cmd.type || "").toLowerCase().replace(/\s+/g, "");
      try {
        if (op === "clearoverlays" || op === "clear") {
          removeVizPrefixed(viewer);
          applied += 1;
          continue;
        }

        if (op === "removeentity" || op === "remove") {
          var rid = fullId(cmd.id != null ? cmd.id : "");
          var ent = viewer.entities.getById(rid);
          if (ent) {
            viewer.entities.remove(ent);
            applied += 1;
          }
          continue;
        }

        if (op === "addpoint" || op === "point") {
          var p = readPosition(cmd);
          if (!p) throw new Error("invalid lon/lat");
          var pid = fullId(cmd.id != null ? cmd.id : "point-" + i);
          var oldP = viewer.entities.getById(pid);
          if (oldP) viewer.entities.remove(oldP);
          var labelText = cmd.label != null ? String(cmd.label) : cmd.text != null ? String(cmd.text) : "";
          viewer.entities.add({
            id: pid,
            name: cmd.name != null ? String(cmd.name) : pid,
            position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.h),
            point: {
              pixelSize: cmd.pixelSize != null ? Number(cmd.pixelSize) : 14,
              color: parseColor(cmd.color, "#f6d365"),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
            },
            label: labelText
              ? {
                  text: labelText,
                  font: "14px system-ui, sans-serif",
                  fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new Cesium.Cartesian2(0, -32),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                }
              : undefined,
          });
          applied += 1;
          continue;
        }

        if (op === "addpolyline" || op === "polyline") {
          var pts = Array.isArray(cmd.positions) ? cmd.positions : [];
          var flat = [];
          for (var pi = 0; pi < pts.length; pi += 1) {
            var pp = readPosition(pts[pi]);
            if (pp) flat.push(pp.lon, pp.lat, pp.h);
          }
          if (flat.length < 6) throw new Error("polyline needs at least 2 positions");
          var lid = fullId(cmd.id != null ? cmd.id : "line-" + i);
          var oldL = viewer.entities.getById(lid);
          if (oldL) viewer.entities.remove(oldL);
          viewer.entities.add({
            id: lid,
            name: cmd.name != null ? String(cmd.name) : lid,
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArrayHeights(flat),
              width: cmd.width != null ? Number(cmd.width) : 3,
              material: parseColor(cmd.color, "#7ec8e3").withAlpha(
                cmd.alpha != null ? Math.min(1, Math.max(0, Number(cmd.alpha))) : 0.92,
              ),
              clampToGround: !!cmd.clampToGround,
            },
          });
          applied += 1;
          continue;
        }

        if (op === "addpolygon" || op === "polygon") {
          var ppts = Array.isArray(cmd.positions) ? cmd.positions : [];
          var ring = [];
          for (var qi = 0; qi < ppts.length; qi += 1) {
            var qp = readPosition(ppts[qi]);
            if (qp) ring.push(qp.lon, qp.lat);
          }
          if (ring.length < 6) throw new Error("polygon needs at least 3 positions");
          var polyId = fullId(cmd.id != null ? cmd.id : "poly-" + i);
          var oldPoly = viewer.entities.getById(polyId);
          if (oldPoly) viewer.entities.remove(oldPoly);
          viewer.entities.add({
            id: polyId,
            name: cmd.name != null ? String(cmd.name) : polyId,
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(ring),
              material: parseColor(cmd.fillColor || cmd.color, "#7ec8e3").withAlpha(
                cmd.fillAlpha != null ? Math.min(1, Math.max(0, Number(cmd.fillAlpha))) : 0.35,
              ),
              outline: cmd.outline !== false,
              outlineColor: parseColor(cmd.outlineColor, "#ffffff").withAlpha(0.9),
            },
          });
          applied += 1;
          continue;
        }

        if (op === "flyto" || op === "cameraflyto") {
          var fp = readPosition(cmd);
          if (!fp) throw new Error("flyTo needs lon/lat");
          var alt = cmd.cameraHeightM != null ? Number(cmd.cameraHeightM) : cmd.rangeM != null ? Number(cmd.rangeM) : null;
          var camH =
            alt != null && Number.isFinite(alt)
              ? alt
              : Math.max(fp.h + 2500, 3500);
          var duration = cmd.duration != null ? Number(cmd.duration) : 2.0;
          if (!Number.isFinite(duration) || duration < 0) duration = 2.0;
          var heading = cmd.headingDeg != null ? Cesium.Math.toRadians(Number(cmd.headingDeg)) : 0;
          var pitch = cmd.pitchDeg != null ? Cesium.Math.toRadians(Number(cmd.pitchDeg)) : Cesium.Math.toRadians(-55);
          await viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(fp.lon, fp.lat, camH),
            orientation: { heading: heading, pitch: pitch, roll: 0 },
            duration: duration,
          });
          applied += 1;
          continue;
        }

        if (op === "setresolutionscale" || op === "resolutionscale") {
          var sc = Number(cmd.scale);
          if (Number.isFinite(sc) && sc >= 0.25 && sc <= 2.0) {
            viewer.resolutionScale = sc;
            applied += 1;
          } else {
            throw new Error("scale must be 0.25–2.0");
          }
          continue;
        }

        if (op === "settrajectorypointbudget" || op === "trajectorybudget" || op === "trajectoryresolution") {
          var budget = parseInt(String(cmd.maxVertices != null ? cmd.maxVertices : cmd.budget), 10);
          if (!Number.isFinite(budget)) throw new Error("maxVertices/budget invalid");
          budget = Math.max(200, Math.min(200000, budget));
          window.__trackerTrajectoryMaxVertices = budget;
          if (typeof window.applyTrajectoryScratch === "function" && window.__trackerLastFlightRecords) {
            window.applyTrajectoryScratch(viewer, window.__trackerLastFlightRecords);
          }
          applied += 1;
          continue;
        }

        if (op === "settrajectorystyle" || op === "trajectorystyle") {
          var tid = "flight-trajectory-polyline";
          var tEnt = viewer.entities.getById(tid);
          if (tEnt && tEnt.polyline) {
            if (cmd.width != null) tEnt.polyline.width = Number(cmd.width);
            if (cmd.color) tEnt.polyline.material = parseColor(cmd.color, "#f0f0f0").withAlpha(
              cmd.alpha != null ? Math.min(1, Math.max(0, Number(cmd.alpha))) : 0.95,
            );
            applied += 1;
          }
          continue;
        }

        errors.push("unknown op: " + (op || "(empty)"));
      } catch (err) {
        errors.push(op + ": " + (err && err.message ? err.message : String(err)));
      }
    }

    return { applied: applied, errors: errors };
  }

  function applyFromResponse(commands) {
    var viewer = typeof window.getCesiumViewer === "function" ? window.getCesiumViewer() : null;
    if (!viewer) {
      return Promise.resolve({ ok: false, applied: 0, errors: ["Cesium viewer not ready"], message: "Open the map first." });
    }
    return applyVizCommands(viewer, commands).then(function (r) {
      return { ok: true, applied: r.applied, errors: r.errors };
    });
  }

  window.__trackerApplyVizCommands = applyFromResponse;
})();
