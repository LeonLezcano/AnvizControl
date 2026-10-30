// @ts-check
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnvizProtocolEngine } from '../engine/AnvizProtocolEngine.mjs';
import { AnvizNetworkScanner } from '../engine/AnvizNetworkScanner.mjs';
import { AttendanceEngine, toArgentinaLocal } from '../engine/AttendanceEngine.mjs';
import { CrossChexCloudEngine } from '../engine/CrossChexCloudEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = process.env.PORT || 3000;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-token'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload demasiado grande'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-token'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // ==========================================
    // API: DASHBOARD & MONITOR EN VIVO
    // ==========================================
    if (pathname === '/api/live' && req.method === 'GET') {
      const date = parsedUrl.searchParams.get('date') || undefined;
      const statusData = AttendanceEngine.getLiveStatus(date);
      return sendJson(res, 200, { success: true, ...statusData });
    }

    // ==========================================
    // API: DISPOSITIVOS (RELOJES ANVIZ)
    // ==========================================
    if (pathname === '/api/devices' && req.method === 'GET') {
      const devices = AttendanceEngine.getDevices();
      return sendJson(res, 200, { success: true, devices });
    }

    // ==========================================
    // API: EMPLEADOS (CRUD)
    // ==========================================
    if (pathname === '/api/employees' && req.method === 'GET') {
      const emps = AttendanceEngine.getEmployees();
      return sendJson(res, 200, { success: true, employees: emps });
    }

    if (pathname === '/api/employees' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.name) {
        return sendJson(res, 400, { success: false, error: 'El nombre es obligatorio' });
      }
      const saved = AttendanceEngine.saveEmployee(body);
      return sendJson(res, 201, { success: true, employee: saved });
    }

    if (pathname.startsWith('/api/employees/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/employees/', '');
      AttendanceEngine.deleteEmployee(id);
      return sendJson(res, 200, { success: true, message: 'Empleado eliminado' });
    }

    // ==========================================
    // API: FICHADAS Y LOGS (CRUD Y RECTIFICACIÓN)
    // ==========================================
    if (pathname === '/api/logs' && req.method === 'GET') {
      const logs = AttendanceEngine.getRawLogs();
      const employees = AttendanceEngine.getEmployees();
      const enriched = logs.map((l) => {
        const emp = AttendanceEngine.resolveEmployee(l.userCode, l.branch, employees);
        const loc = toArgentinaLocal(l.timestamp);
        return {
          ...l,
          localDate: loc.localDate,
          localTime: loc.localTime,
          employeeName: emp ? emp.name : (l.employeeNameHint || `ID ${l.userCode}`),
          employeeId: emp ? emp.id : null,
          workno: emp ? emp.workno : l.userCode,
          department: emp ? emp.department : (l.departmentHint || 'Regondi srl')
        };
      });
      return sendJson(res, 200, { success: true, logs: enriched });
    }

    if (pathname === '/api/logs' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.userCode || !body.timestamp) {
        return sendJson(res, 400, { success: false, error: 'Código de usuario y timestamp son requeridos' });
      }
      const result = AttendanceEngine.appendLogs([body]);
      return sendJson(res, 201, { success: true, result });
    }

    if (pathname.startsWith('/api/logs/') && req.method === 'PUT') {
      const logId = pathname.replace('/api/logs/', '');
      const body = await parseBody(req);
      const updated = AttendanceEngine.updateLog(logId, body);
      if (!updated) {
        return sendJson(res, 404, { success: false, error: 'Fichada no encontrada' });
      }
      return sendJson(res, 200, { success: true, log: updated });
    }

    if (pathname.startsWith('/api/logs/') && req.method === 'DELETE') {
      const logId = pathname.replace('/api/logs/', '');
      AttendanceEngine.deleteLog(logId);
      return sendJson(res, 200, { success: true, message: 'Fichada eliminada correctamente' });
    }

    // ==========================================
    // API: REPORTES Y ASISTENCIA
    // ==========================================
    if (pathname === '/api/reports/attendance' && req.method === 'GET') {
      const empId = parsedUrl.searchParams.get('employeeId');
      const start = parsedUrl.searchParams.get('startDate') || '2026-10-01';
      const end = parsedUrl.searchParams.get('endDate') || '2026-10-30';

      if (!empId) {
        return sendJson(res, 400, { success: false, error: 'Debe especificar el employeeId' });
      }

      const report = AttendanceEngine.calculateAttendance(empId, start, end);
      return sendJson(res, 200, { success: true, report });
    }

    // ==========================================
    // API: ESCÁNER DE RED LOCAL ANVIZ (PUERTO 5010)
    // ==========================================
    if (pathname === '/api/scanner/run' && req.method === 'POST') {
      const body = await parseBody(req);
      const subnet = body.subnet || '192.168.0';
      const start = Number(body.start) || 1;
      const end = Number(body.end) || 254;

      const found = await AnvizNetworkScanner.scanSubnet(subnet, start, end);
      return sendJson(res, 200, { success: true, found });
    }

    if (pathname === '/api/scanner/test-host' && req.method === 'POST') {
      const body = await parseBody(req);
      const ip = body.ip || '192.168.0.218';
      const port = Number(body.port) || 5010;
      const result = await AnvizNetworkScanner.testAnvizHost(ip, port, 1500);
      return sendJson(res, 200, { success: true, result });
    }

    // ==========================================
    // API: SINCRONIZACIÓN CROSSCHEX CLOUD
    // ==========================================
    if (pathname === '/api/cloud/sync' && req.method === 'POST') {
      const body = await parseBody(req);
      const result = await CrossChexCloudEngine.syncFromCloud({
        email: body.email,
        password: body.password,
        startDate: body.startDate,
        endDate: body.endDate
      });
      return sendJson(res, 200, { success: true, result });
    }

    if (pathname === '/api/cloud/session' && req.method === 'GET') {
      const session = CrossChexCloudEngine.getSavedSession();
      return sendJson(res, 200, {
        success: true,
        hasSession: Boolean(session?.token),
        companyName: session?.companyName || 'Regondi srl',
        email: session?.email || '',
        updatedAt: session?.updatedAt || null
      });
    }

    // ==========================================
    // SERVIR ARCHIVOS ESTÁTICOS
    // ==========================================
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Acceso denegado');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    sendJson(res, 404, { success: false, error: 'Ruta no encontrada' });
  } catch (err) {
    console.error('Error en servidor:', err);
    sendJson(res, 500, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[AnvizControl] Servidor activo en http://localhost:${PORT}`);
});
