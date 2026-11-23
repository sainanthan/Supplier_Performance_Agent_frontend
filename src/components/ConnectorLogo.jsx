import { siMqtt, siMysql, siOdoo, siOracle, siPostgresql, siRockwellautomation, siSap, siSiemens } from "./brandIcons";
import { Anchor, FileSpreadsheet, FileText, FlaskConical, FolderSync, Globe, MapPin, Radio, Truck, Users, Warehouse } from "lucide-react";

/* Connector logos. Real brand marks come from Simple Icons (CC0, bundled; no network). A brand that Simple Icons does not carry
   gets a monogram tile in its brand colour; generic sources get a neutral icon. Marks identify the system only. */
const BRAND = {
  postgresql: siPostgresql, oracle: siOracle, oracle_ebs: siOracle, mysql: siMysql, hana: siSap, sap_odata: siSap, sap_tables: siSap, sap_qm: siSap,
  odoo: siOdoo, opcenter: siSiemens, factorytalk: siRockwellautomation, mqtt: siMqtt,
};
const MONO = {
  sqlserver: ["SQL", "#CC2927"], db2: ["Db2", "#054ADA"], dynamics365: ["D365", "#0B53CE"], infor: ["infor", "#E2001A"], mes_db_rest: ["MES", "#4F5D75"],
  opcua: ["OPC", "#1F4E79"], aveva_mes: ["AV", "#5A2CA0"], plex: ["PX", "#0072CE"], tulip: ["TU", "#1A1A1A"], ignition: ["IG", "#F47920"],
  etq: ["ETQ", "#00857C"], mastercontrol: ["MC", "#003B71"], qualio: ["Q", "#4B4DED"], wms_db: ["WMS", "#6B4F2A"], project44: ["p44", "#1B1B4B"],
  fourkites: ["FK", "#0F62FE"], modbus: ["MB", "#2E7D32"], pi: ["PI", "#00A3E0"], edi: ["EDI", "#455A64"], neon: ["neon", "#00E599", "#0B2A1F"],
};
const GENERIC = { csv_excel: [FileSpreadsheet, "#1D6F42"], sftp: [FolderSync, "#5B6B8C"], ais: [Anchor, "#0B6E99"], telematics: [MapPin, "#E4572E"],
  asn_feed: [Truck, "#8E6C21"], portal_api: [Users, "#6F3DBA"], rest_api: [Globe, "#4D8EEB"], demo_mock: [FlaskConical, "#6F3DBA"], wms: [Warehouse, "#6B4F2A"],
  edi_files: [FileText, "#455A64"], iot: [Radio, "#2E7D32"] };

export default function ConnectorLogo({ k, size = 40, title, fallback: Fallback }) {
  const s = { width: size, height: size };
  const b = BRAND[k];
  if (b) return (
    <span className="cl-logo" style={s} title={title || b.title}>
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} role="img" aria-label={b.title}><path d={b.path} fill={`#${b.hex}`} /></svg>
    </span>);
  const m = MONO[k];
  if (m) return <span className="cl-logo mono" style={{ ...s, background: m[1], color: m[2] || "#fff", fontSize: size * (m[0].length > 3 ? 0.26 : 0.32) }} title={title} aria-label={title}>{m[0]}</span>;
  const [I, col] = GENERIC[k] || [Fallback || Globe, "#6F3DBA"];
  return <span className="cl-logo" style={{ ...s, color: col }} title={title} aria-label={title}><I size={size * 0.52} /></span>;
}
