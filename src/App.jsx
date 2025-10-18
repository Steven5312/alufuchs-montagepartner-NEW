import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";
import { MapContainer, TileLayer, Marker, Circle, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

/* ========================= Styles ========================= */
const injectStyles = () => `
  :root{
    --bg: #0b0c10;
    --panel: #111318;
    --panel-2: #0e1116;
    --text: #e8eaed;
    --muted: #9aa0a6;
    --brand: #0ea5e9;
    --border: #1f242d;
    --hover: rgba(255,255,255,.06);
    --shadow: 0 6px 24px rgba(0,0,0,.45);
    --radius-xl: 16px;
    --radius-md: 10px;
  }
  *{ box-sizing: border-box }
  html, body, #root { height: 100%; }
  body{ margin:0; background:var(--bg); color:var(--text); font:14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; }
  .container{ max-width:1400px; margin:24px auto; padding:0 16px; }
  .title{ margin:0 0 8px; font-weight:800; }
  .subtitle{ color:var(--muted); margin:0 0 24px; }
  .grid{ display:grid; grid-template-columns:460px 1fr; gap:16px; align-items:start; }
  @media (max-width:1024px){ .grid{ grid-template-columns:1fr; } }
  .card{ background:linear-gradient(180deg,var(--panel),var(--panel-2)); border:1px solid var(--border); border-radius:var(--radius-xl); box-shadow:var(--shadow); }
  .card-body{ padding:16px; }
  .leftTall{ height:80vh; overflow:auto; }
  .label{ display:block; font-size:12px; color:var(--muted); margin:10px 0 6px; }
  .input{ width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:var(--radius-md); background:#0c0f15; color:var(--text); }
  .input:focus{ border-color:var(--brand); outline:none; box-shadow:0 0 0 3px rgba(14,165,233,.15); }
  .btns{ display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .btn{ padding:8px 14px; border:1px solid var(--border); border-radius:10px; background:#0e1319; color:var(--text); cursor:pointer; }
  .btn:hover{ background:var(--hover); }
  .btn-primary{ background:linear-gradient(180deg,#0ea5e9,#0284c7); border-color:transparent; color:#fff; }
  .btn-success{ background:linear-gradient(180deg,#22c55e,#16a34a); border-color:transparent; color:#fff; }
  .btn-danger{ background:linear-gradient(180deg,#ef4444,#b91c1c); border-color:transparent; color:#fff; }
  .map-wrap{ border-radius:var(--radius-xl); overflow:hidden; border:1px solid var(--border); box-shadow:var(--shadow); }
  .map{ height:80vh; width:100%; }
  .toggle{ display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .list-wrap{ margin-top:28px; }
  .table-wrap{ overflow:auto; }
  table{ width:100%; border-collapse:collapse; table-layout:fixed; }
  thead th{ position:sticky; top:0; background:#0d1117; padding:10px 8px; text-align:left; }
  tbody td{ padding:8px; border-top:1px solid var(--border); vertical-align:top; word-wrap:break-word; overflow-wrap:anywhere; }
  tr:hover{ background:rgba(255,255,255,.03); }
`;
function StyleInjector(){
  useEffect(()=>{
    const id="partner-styles";
    if(!document.getElementById(id)){
      const s=document.createElement("style");
      s.id=id; s.innerHTML=injectStyles();
      document.head.appendChild(s);
    }
  },[]);
  return null;
}

/* ====================== Leaflet Marker ====================== */
const defaultIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

/* ========================= Helpers ========================= */
const toNum = (v) => {
  if (v === null || v === undefined) return NaN;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
};

// DMS -> Dezimal
function dmsToDec(d, m, s, dir) {
  const sign = /[SW]/i.test(dir) ? -1 : 1;
  const deg = Number(d) || 0;
  const min = Number(m) || 0;
  const sec = Number(s) || 0;
  return sign * (deg + min / 60 + sec / 3600);
}

// Google Maps Clipboard Parser (Dezimal + DMS)
function parseGMapsCoords(input) {
  if (!input) return null;
  const str = input.trim();

  // Dezimal "lat, lng"
  const dec = str.match(/^\s*([+-]?\d+(?:[.,]\d+)?)\s*,\s*([+-]?\d+(?:[.,]\d+)?)\s*$/);
  if (dec) {
    const lat = Number(dec[1].replace(",", "."));
    const lng = Number(dec[2].replace(",", "."));
    if (isFinite(lat) && isFinite(lng)) return { lat, lng };
  }

  // DMS 48°54'30.3"N 9°13'56.4"E
  const dms = str.match(/(\d+)[°:\s]\s*(\d+)[′'\s]\s*(\d+(?:[.,]\d+)?)?["″]?\s*([NS])[^0-9\-+]+(\d+)[°:\s]\s*(\d+)[′'\s]\s*(\d+(?:[.,]\d+)?)?["″]?\s*([EW])/i);
  if (dms) {
    const lat = dmsToDec(dms[1], dms[2], dms[3], dms[4]);
    const lng = dmsToDec(dms[5], dms[6], dms[7], dms[8]);
    if (isFinite(lat) && isFinite(lng)) return { lat, lng };
  }
  return null;
}

function ClickToSetLatLng({ onPick }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

/* =========================== App =========================== */
export default function App(){
  return (
    <>
      <StyleInjector />
      <PartnersUI />
    </>
  );
}

function PartnersUI(){
  const [partners, setPartners] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const [newPartner, setNewPartner] = useState({
    name: "", city: "", address: "", phone: "", email: "",
    lat: "", lng: "", radius_km: 0,
  });
  const [gmapsRaw, setGmapsRaw] = useState("");
  const [editing, setEditing] = useState(null);

  const [center, setCenter] = useState([48.7784485, 9.1800132]); // Stuttgart
  const [zoom] = useState(8);
  const [showRanges, setShowRanges] = useState(true);

  // Load partners
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("*")
        .order("created_at", { ascending: true });
      if (!error) setPartners(data ?? []);
    })();
  }, []);

  // Parse GMaps clipboard line
  const applyGMapsLine = (text) => {
    setGmapsRaw(text);
    const coords = parseGMapsCoords(text);
    if (coords) {
      setNewPartner((v) => ({ ...v, lat: String(coords.lat), lng: String(coords.lng) }));
      setCenter([coords.lat, coords.lng]);
    }
  };

  /* ---------------------- CRUD: Add ---------------------- */
  const addPartner = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const lat = toNum(newPartner.lat);
    const lng = toNum(newPartner.lng);
    const radius_km = Math.max(0, Number(newPartner.radius_km) || 0);

    if (!newPartner.name || !isFinite(lat) || !isFinite(lng)) {
      alert("Bitte Name + gültige Koordinaten (lat/lng) eingeben.");
      setIsSaving(false);
      return;
    }

    const payload = {
      ...newPartner,
      lat, lng, radius_km,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("partners")
      .insert([payload])
      .select("*")
      .single();

    if (!error) {
      setPartners((prev) => [...prev, data]);
      setNewPartner({ name: "", city: "", address: "", phone: "", email: "", lat: "", lng: "", radius_km: 0 });
      setGmapsRaw("");
    }
    setIsSaving(false);
  };

  /* ---------------------- CRUD: Edit ---------------------- */
  const saveEdit = async () => {
    if (!editing) return;
    const lat = toNum(editing.lat);
    const lng = toNum(editing.lng);
    const radius_km = Math.max(0, Number(editing.radius_km) || 0);

    if (!editing.name || !isFinite(lat) || !isFinite(lng)) {
      alert("Bitte gültige Werte eingeben.");
      return;
    }

    const payload = {
      ...editing,
      lat, lng, radius_km,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("partners")
      .update(payload)
      .eq("id", editing.id)
      .select("*")
      .single();

    if (!error) {
      setPartners((prev) => prev.map((p) => (p.id === editing.id ? data : p)));
      setEditing(null);
    }
  };

  /* --------------------- CRUD: Delete --------------------- */
  const removePartner = async (id) => {
    if (!window.confirm("Diesen Partner wirklich löschen?")) return;
    const { error } = await supabase.from("partners").delete().eq("id", id);
    if (!error) setPartners((prev) => prev.filter((p) => p.id !== id));
  };

  /* ---------------------- Map helpers --------------------- */
  const markerLat = toNum(newPartner.lat);
  const markerLng = toNum(newPartner.lng);
  const markerPos = Number.isFinite(markerLat) && Number.isFinite(markerLng) ? [markerLat, markerLng] : center;

  const handlePickLatLng = (lat, lng) => {
    setNewPartner((v) => ({ ...v, lat: String(lat), lng: String(lng) }));
    setCenter([lat, lng]);
  };

  return (
    <div className="container">
      <h1 className="title">ALUFUCHS MONTAGEPARTNER</h1>
      <p className="subtitle">Füge neue Partner hinzu, bearbeite bestehende Einträge und platziere sie direkt auf der Karte.</p>

      {/* TOP: Formular (links) + Karte (rechts) */}
      <div className="grid">
        {/* LEFT: Form (scrollable, gleiche Höhe wie Karte) */}
        <div className="card leftTall card-body">
          <div className="toggle">
            <input
              id="radien"
              type="checkbox"
              checked={showRanges}
              onChange={(e)=>setShowRanges(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <label htmlFor="radien">Einsatzradien anzeigen</label>
          </div>

          <h3 style={{marginTop:0}}>Neuen Partner hinzufügen</h3>

          <label className="label">Google Maps Koordinaten (optional)</label>
          <input
            className="input"
            placeholder={`z. B. 48°54'30.3"N 9°13'56.4"E oder 48.90839, 9.23239`}
            value={gmapsRaw}
            onChange={(e) => applyGMapsLine(e.target.value)}
          />

          <label className="label">Name *</label>
          <input className="input" value={newPartner.name} onChange={(e)=>setNewPartner(v=>({...v, name:e.target.value}))} />

          <label className="label">Stadt</label>
          <input className="input" value={newPartner.city} onChange={(e)=>setNewPartner(v=>({...v, city:e.target.value}))} />

          <label className="label">Adresse</label>
          <input className="input" value={newPartner.address} onChange={(e)=>setNewPartner(v=>({...v, address:e.target.value}))} />

          <label className="label">Telefon</label>
          <input className="input" value={newPartner.phone} onChange={(e)=>setNewPartner(v=>({...v, phone:e.target.value}))} />

          <label className="label">E-Mail</label>
          <input className="input" value={newPartner.email} onChange={(e)=>setNewPartner(v=>({...v, email:e.target.value}))} />

          <label className="label">Breite (lat)</label>
          <input className="input" value={newPartner.lat} onChange={(e)=>setNewPartner(v=>({...v, lat:e.target.value}))} />

          <label className="label">Länge (lng)</label>
          <input className="input" value={newPartner.lng} onChange={(e)=>setNewPartner(v=>({...v, lng:e.target.value}))} />

          <label className="label">Einsatz-Radius (km)</label>
          <input className="input" type="number" min="0" value={newPartner.radius_km} onChange={(e)=>setNewPartner(v=>({...v, radius_km:e.target.value}))} />

          <div className="btns">
            <button className="btn btn-primary" onClick={addPartner} disabled={isSaving}>
              {isSaving ? "Speichere…" : "➕ Hinzufügen"}
            </button>
          </div>
        </div>

        {/* RIGHT: Map */}
        <div className="map-wrap">
          <MapContainer center={center} zoom={zoom} className="map">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickToSetLatLng onPick={handlePickLatLng} />

            {/* Marker für aktuell eingegebene Koordinaten */}
            <Marker position={markerPos}>
              <Popup>Neuer Partner</Popup>
            </Marker>

            {/* Marker + Radius für alle gespeicherten Partner */}
            {partners.map((p) => {
              const plat = Number(p.lat), plng = Number(p.lng);
              if (!Number.isFinite(plat) || !Number.isFinite(plng)) return null;
              return (
                <React.Fragment key={p.id}>
                  <Marker position={[plat, plng]}>
                    <Popup>
                      <strong>{p.name}</strong><br/>
                      {p.city}<br/>
                      {p.address}<br/>
                      {p.phone}<br/>
                      {p.email}<br/>
                      Radius: {Number(p.radius_km || 0)} km
                    </Popup>
                  </Marker>
                  {showRanges && Number(p.radius_km) > 0 && (
                    <Circle
                      center={[plat, plng]}
                      radius={Number(p.radius_km) * 1000}
                      pathOptions={{ color: "#0ea5e9", opacity: 0.35, fillOpacity: 0.06 }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* FULL-WIDTH LIST BELOW */}
      <div className="card list-wrap">
        <div className="card-body">
          <h3 style={{marginTop:0}}>Partnerliste ({partners.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Stadt</th>
                  <th>Adresse</th>
                  <th>Telefon</th>
                  <th>E-Mail</th>
                  <th>Lat</th>
                  <th>Lng</th>
                  <th>Radius (km)</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id}>
                    {editing?.id === p.id ? (
                      <>
                        <td><input className="input" value={editing.name} onChange={(e)=>setEditing(v=>({...v, name:e.target.value}))} /></td>
                        <td><input className="input" value={editing.city || ""} onChange={(e)=>setEditing(v=>({...v, city:e.target.value}))} /></td>
                        <td><input className="input" value={editing.address || ""} onChange={(e)=>setEditing(v=>({...v, address:e.target.value}))} /></td>
                        <td><input className="input" value={editing.phone || ""} onChange={(e)=>setEditing(v=>({...v, phone:e.target.value}))} /></td>
                        <td><input className="input" value={editing.email || ""} onChange={(e)=>setEditing(v=>({...v, email:e.target.value}))} /></td>
                        <td><input className="input" value={String(editing.lat ?? "")} onChange={(e)=>setEditing(v=>({...v, lat:e.target.value}))} /></td>
                        <td><input className="input" value={String(editing.lng ?? "")} onChange={(e)=>setEditing(v=>({...v, lng:e.target.value}))} /></td>
                        <td><input className="input" type="number" min="0" value={String(editing.radius_km ?? 0)} onChange={(e)=>setEditing(v=>({...v, radius_km:e.target.value}))} /></td>
                        <td>
                          <div className="btns">
                            <button className="btn btn-success" onClick={saveEdit}>💾 Speichern</button>
                            <button className="btn" onClick={()=>setEditing(null)}>❌ Abbrechen</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{fontWeight:700}}>{p.name}</td>
                        <td>{p.city}</td>
                        <td>{p.address}</td>
                        <td>{p.phone}</td>
                        <td>{p.email}</td>
                        <td>{Number(p.lat).toFixed(5)}</td>
                        <td>{Number(p.lng).toFixed(5)}</td>
                        <td>{Number(p.radius_km || 0)}</td>
                        <td>
                          <div className="btns">
                            <button className="btn" onClick={()=>setEditing(p)}>✏️ Bearbeiten</button>
                            <button className="btn btn-danger" onClick={()=>removePartner(p.id)}>🗑️ Löschen</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
