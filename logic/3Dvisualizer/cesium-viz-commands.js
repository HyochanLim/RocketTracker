/* global Cesium */
/**
 * Declarative visualization layer: agent/LLM outputs result.vizCommands[]; this applies them to the viewer.
 * Entity ids are prefixed with "viz-" and cleared by op "clearOverlays". Core flight ids (launch-point, flight-trajectory-polyline) are untouched.
 *
 * Position aliases (LLM-friendly): top-level lon/lat, longitude/latitude, x/y (heuristic), or nested point.{x,y|lon,lat}.
 * Styling: color or style.color; pixelSize or style.radius / style.pixelSize. label string or label.{text,offset}.
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

  /** If one value is outside latitude range, treat it as longitude (handles x=126, y=35). */
  function inferLonLat(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < -90 || x > 90) return { lon: x, lat: y };
    if (y < -90 || y > 90) return { lon: y, lat: x };
    return { lon: x, lat: y };
  }

  /**
   * lon/lat/height from command or common LLM shapes (point.x/y, x/y, longitude/latitude).
   */
  function readPosition(cmd) {
    if (!cmd || typeof cmd !== "object") return null;

    var lon = Number(cmd.lon != null ? cmd.lon : cmd.longitude);
    var lat = Number(cmd.lat != null ? cmd.lat : cmd.latitude);
    var h = 0;

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      if (cmd.x != null && cmd.y != null) {
        var ll = inferLonLat(Number(cmd.x), Number(cmd.y));
        if (ll) {
          lon = ll.lon;
          lat = ll.lat;
        }
      }
    }

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      var pt = cmd.point;
      if (pt && typeof pt === "object") {
        var px = pt.x != null ? pt.x : pt.lon != null ? pt.lon : pt.longitude;
        var py = pt.y != null ? pt.y : pt.lat != null ? pt.lat : pt.latitude;
        if (px != null && py != null) {
          var ll2 = inferLonLat(Number(px), Number(py));
          if (ll2) {
            lon = ll2.lon;
            lat = ll2.lat;
          }
        }
        if (pt.z != null && Number.isFinite(Number(pt.z))) h = Number(pt.z);
        else if (pt.heightM != null && Number.isFinite(Number(pt.heightM))) h = Number(pt.heightM);
        else if (pt.alt != null && Number.isFinite(Number(pt.alt))) h = Number(pt.alt);
      }
    }

    if (cmd.heightM != null && Number.isFinite(Number(cmd.heightM))) h = Number(cmd.heightM);
    else if (cmd.alt != null && Number.isFinite(Number(cmd.alt))) h = Number(cmd.alt);
    else if (cmd.elevation != null && Number.isFinite(Number(cmd.elevation))) h = Number(cmd.elevation);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    if (!Number.isFinite(h)) h = 0;
    return { lon: lon, lat: lat, h: h };
  }

  function readLabelText(cmd) {
    if (cmd.text != null && String(cmd.text).trim()) return String(cmd.text);
    if (cmd.label == null) return "";
    if (typeof cmd.label === "string") return String(cmd.label);
    if (typeof cmd.label === "object" && cmd.label.text != null) return String(cmd.label.text);
    return String(cmd.label);
  }

  function readStyleColor(cmd) {
    if (cmd.color != null) return cmd.color;
    if (cmd.style && cmd.style.color != null) return cmd.style.color;
    return null;
  }

  function readPixelSize(cmd, fallback) {
    var fb = fallback != null ? fallback : 14;
    if (cmd.pixelSize != null && Number.isFinite(Number(cmd.pixelSize))) return Number(cmd.pixelSize);
    if (cmd.style && typeof cmd.style === "object") {
      if (cmd.style.pixelSize != null && Number.isFinite(Number(cmd.style.pixelSize))) return Number(cmd.style.pixelSize);
      if (cmd.style.radius != null && Number.isFinite(Number(cmd.style.radius))) return Number(cmd.style.radius);
      if (cmd.style.size != null && Number.isFinite(Number(cmd.style.size))) return Number(cmd.style.size);
    }
    return fb;
  }

  function readLabelPixelOffset(cmd) {
    var lo = cmd.label && typeof cmd.label === "object" ? cmd.label.offset : null;
    if (Array.isArray(lo) && lo.length >= 2 && Number.isFinite(Number(lo[0])) && Number.isFinite(Number(lo[1]))) {
      return new Cesium.Cartesian2(Number(lo[0]), Number(lo[1]));
    }
    return new Cesium.Cartesian2(0, -32);
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
          var labelText = readLabelText(cmd).trim();
          var labelOffset = readLabelPixelOffset(cmd);
          viewer.entities.add({
            id: pid,
            name: cmd.name != null ? String(cmd.name) : pid,
            position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.h),
            point: {
              pixelSize: readPixelSize(cmd, 14),
              color: parseColor(readStyleColor(cmd), "#f6d365"),
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
                  pixelOffset: labelOffset,
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
              material: parseColor(readStyleColor(cmd), "#7ec8e3").withAlpha(
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
              material: parseColor(
                cmd.fillColor || cmd.color || (cmd.style && cmd.style.fillColor) || readStyleColor(cmd),
                "#7ec8e3",
              ).withAlpha(cmd.fillAlpha != null ? Math.min(1, Math.max(0, Number(cmd.fillAlpha))) : 0.35),
              outline: cmd.outline !== false,
              outlineColor: parseColor(cmd.outlineColor || (cmd.style && cmd.style.outlineColor), "#ffffff").withAlpha(0.9),
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
