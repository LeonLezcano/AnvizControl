// @ts-check
/**
 * Frontend de CrossChex Control (Regondi srl)
 * Paleta oficial de CrossChex Cloud: #05aa8c (Primario), #f0f2f5 (Fondo), fuentes de sistema limpias.
 */

const Sanitizer = {
  escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  safeSetInnerHTML(element, rawHTML) {
    if (!element) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHTML, 'text/html');

    // Remover elementos potencialmente peligrosos
    const scripts = doc.querySelectorAll('script, iframe, object, embed');
    scripts.forEach((s) => s.remove());

    // Sanitizar atributos inline peligrosos
    const all = doc.querySelectorAll('*');
    all.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        if (['href', 'src', 'action'].includes(attr.name)) {
          const val = attr.value.trim().toLowerCase();
          if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) {
            el.removeAttribute(attr.name);
          }
        }
      });
    });

    element.replaceChildren(...Array.from(doc.body.childNodes));
  },

  sanitizeURL(url) {
    if (!url) return '';
    const clean = String(url).trim();
    const lower = clean.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) {
      return '#';
    }
    return clean;
  }
};

let currentEmployees = [];
let currentLogs = [];
let currentDevices = [];
let lastReport = null;

// Manejo de Tabs y Vistas
const tabTitles = {
  'tab-dashboard': 'Dashboard General',
  'tab-live': 'Monitor en Vivo (Tiempo Real)',
  'tab-reports': 'Reporte T&A y Horas Trabajadas',
  'tab-records': 'Fichadas & Auditoría de Marcas',
  'tab-employees': 'Personal / Empleados (Padrón)',
  'tab-devices': 'Estado de Relojes Anviz VF30 Pro'
};

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((tc) => tc.classList.remove('active'));

  const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');

  const content = document.getElementById(tabId);
  if (content) content.classList.add('active');

  // Actualizar título del topbar
  const topbarTitle = document.getElementById('topbarCurrentView');
  if (topbarTitle && tabTitles[tabId]) {
    topbarTitle.textContent = tabTitles[tabId];
  }

  // Cerrar sidebar en vista móvil
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  if (tabId === 'tab-dashboard') loadDashboard();
  if (tabId === 'tab-live') loadLiveStatus();
  if (tabId === 'tab-reports') setupReportsTab();
  if (tabId === 'tab-records') loadLogs();
  if (tabId === 'tab-employees') loadEmployees();
  if (tabId === 'tab-devices') loadDevices();
}

window.switchTab = switchTab;

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    if (tabId) switchTab(tabId);
  });
});

// Control de Drawer Móvil
document.getElementById('btnMobileMenu')?.addEventListener('click', () => {
  document.getElementById('appSidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('active');
});

document.getElementById('btnSidebarClose')?.addEventListener('click', () => {
  document.getElementById('appSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
});

document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
  document.getElementById('appSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
});

// Reloj en tiempo real en Topbar
function updateTopbarClock() {
  const el = document.getElementById('topbarClock');
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  el.textContent = `${hh}:${mm}:${ss}`;
}
setInterval(updateTopbarClock, 1000);
updateTopbarClock();

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

window.openModal = openModal;
window.closeModal = closeModal;

// 1. CARGA DEL DASHBOARD
async function loadDashboard() {
  try {
    const res = await fetch('/api/live');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const d = data.dashboard;
    document.getElementById('kpiTotalExpected').textContent = String(d.totalExpected);
    document.getElementById('kpiActualAttendance').textContent = String(d.actualAttendance);
    document.getElementById('kpiInsideNow').textContent = String(d.insideNowCount);
    document.getElementById('kpiTotalRecords').textContent = String(d.totalRecords);
    document.getElementById('kpiOnlineDevices').textContent = `${d.onlineDevices} / ${d.totalDevices}`;

    document.getElementById('dashTodayDate').textContent = d.todayDate;
    document.getElementById('dashActualAttendanceNum').textContent = String(d.actualAttendance);
    document.getElementById('dashTotalExpectedText').textContent = String(d.totalExpected);

    const pct = d.totalExpected > 0 ? Math.round((d.actualAttendance / d.totalExpected) * 100) : 0;
    document.getElementById('dashAttendancePercent').textContent = `${pct}%`;
    const bar = document.getElementById('dashProgressBar');
    if (bar) bar.style.width = `${pct}%`;

    // Ausentes hoy
    document.getElementById('dashAbsentCount').textContent = String(d.absentTodayCount);
    const tagsBox = document.getElementById('dashAbsentTags');
    if (tagsBox) {
      if (d.absentTodayList && d.absentTodayList.length > 0) {
        Sanitizer.safeSetInnerHTML(
          tagsBox,
          d.absentTodayList
            .map((a) => `<span class="badge badge-danger">${Sanitizer.escapeHTML(a.name)} (${Sanitizer.escapeHTML(a.workno)})</span>`)
            .join('')
        );
      } else {
        Sanitizer.safeSetInnerHTML(tagsBox, '<span style="font-size: 0.8rem; color: var(--cc-green);">¡Asistencia completa hoy!</span>');
      }
    }

    // Ayer
    const y = d.yesterdayStats;
    document.getElementById('dashYesterdayDate').textContent = `Jornada del ${y.date}`;
    document.getElementById('yStatLate').textContent = String(y.late);
    document.getElementById('yStatEarly').textContent = String(y.early);
    document.getElementById('yStatAbsent').textContent = String(y.absent);
    document.getElementById('yStatOvertime').textContent = String(y.overtime);
    document.getElementById('yStatException').textContent = String(y.exception);

    // Cargar tarjetas de dispositivos
    await loadDevices(true);
  } catch (err) {
    console.error('Error cargando dashboard:', err);
  }
}

// 2. DISPOSITIVOS ANVIZ
async function loadDevices(mini = false) {
  try {
    const res = await fetch('/api/devices');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentDevices = data.devices;
    const containers = mini ? [document.getElementById('dashDeviceCards')] : [document.getElementById('devicesFullList'), document.getElementById('dashDeviceCards')];

    containers.forEach((box) => {
      if (!box) return;
      Sanitizer.safeSetInnerHTML(
        box,
        currentDevices.map((dev) => `
        <div class="device-box">
          <div class="device-header">
            <div>
              <div class="device-name">${Sanitizer.escapeHTML(dev.name)}</div>
              <div class="device-model">${Sanitizer.escapeHTML(dev.model)} • S/N: <code>${Sanitizer.escapeHTML(dev.serialNumber)}</code></div>
            </div>
            <span class="badge ${dev.status === 'ONLINE' ? 'badge-success' : 'badge-danger'}">
              ${dev.status === 'ONLINE' ? '🟢 En Línea' : '🔴 Desconectado'}
            </span>
          </div>
          <div style="font-size: 0.8rem; color: var(--cc-text-regular); line-height: 1.5;">
            <div>🏢 <b>Ubicación:</b> ${Sanitizer.escapeHTML(dev.department)}</div>
            <div>🌐 <b>Conexión:</b> ${Sanitizer.escapeHTML(dev.ip)} (Puerto ${dev.port})</div>
          </div>
          <div class="device-metrics">
            <div>Usuarios<b>${dev.userCount}</b></div>
            <div>Huellas<b>${dev.fpCount}</b></div>
            <div>PIN/Pass<b>${dev.pwdCount}</b></div>
            <div>Device ID<b>${Sanitizer.escapeHTML(dev.id)}</b></div>
          </div>
        </div>
      `).join('')
      );
    });
  } catch (err) {
    console.error('Error cargando dispositivos:', err);
  }
}

// 3. MONITOR EN VIVO
async function loadLiveStatus() {
  const tbody = document.querySelector('#tblLive tbody');
  if (!tbody) return;
  Sanitizer.safeSetInnerHTML(tbody, '<tr><td colspan="8" style="text-align: center; color: var(--cc-text-secondary);">Consultando presencia en tiempo real...</td></tr>');

  try {
    const dateInput = document.getElementById('liveDateFilter');
    const dateQuery = dateInput && dateInput.value ? `?date=${dateInput.value}` : '';
    const res = await fetch(`/api/live${dateQuery}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    tbody.replaceChildren();
    data.live.forEach((emp) => {
      const tr = document.createElement('tr');
      const badge = emp.status === 'PRESENTE' ? '<span class="badge badge-success">🟢 Adentro</span>' : emp.status === 'RETIRADO' ? '<span class="badge badge-warning">🟡 Retirado</span>' : '<span class="badge badge-info">⚪ Sin Fichar</span>';

      Sanitizer.safeSetInnerHTML(
        tr,
        `
        <td><b>${Sanitizer.escapeHTML(emp.workno)}</b></td>
        <td><strong>${Sanitizer.escapeHTML(emp.name)}</strong></td>
        <td><small>${Sanitizer.escapeHTML(emp.department)}</small></td>
        <td>${badge}</td>
        <td>${Sanitizer.escapeHTML(emp.firstPunchTime || '-')}</td>
        <td>${Sanitizer.escapeHTML(emp.lastPunchTime ? emp.lastPunchTime.slice(0, 5) : '-')}</td>
        <td><span class="badge badge-primary">${Sanitizer.escapeHTML(emp.lastBranch || '-')}</span></td>
        <td><b>${emp.todayPunchesCount}</b> fichadas</td>
      `
      );
      tbody.appendChild(tr);
    });
  } catch (err) {
    Sanitizer.safeSetInnerHTML(tbody, `<tr><td colspan="8" style="color: var(--cc-danger);">Error: ${Sanitizer.escapeHTML(err.message)}</td></tr>`);
  }
}

// 4. REPORTES T&A
function setupReportsTab() {
  const select = document.getElementById('repEmployeeSelect');
  if (!select) return;

  Sanitizer.safeSetInnerHTML(
    select,
    currentEmployees
      .map(
        (e) => `
    <option value="${e.id}">${Sanitizer.escapeHTML(e.name)} (Legajo: ${Sanitizer.escapeHTML(e.workno)})</option>
  `
      )
      .join('')
  );

  if (currentEmployees.length > 0) {
    runReport();
  }
}

async function runReport() {
  const empId = document.getElementById('repEmployeeSelect')?.value;
  const start = document.getElementById('repStartDate')?.value;
  const end = document.getElementById('repEndDate')?.value;
  const tbody = document.querySelector('#tblReportDetails tbody');
  if (!tbody || !empId) return;

  Sanitizer.safeSetInnerHTML(tbody, '<tr><td colspan="9" style="text-align: center;">Calculando asistencia de ambas sucursales...</td></tr>');

  try {
    const res = await fetch(`/api/reports/attendance?employeeId=${empId}&startDate=${start}&endDate=${end}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    lastReport = data.report;
    const r = data.report;

    document.getElementById('sumTotalHours').textContent = `${r.summary.totalHours} h`;
    document.getElementById('sumDaysWorked').textContent = String(r.summary.daysWorked);
    document.getElementById('sumAbsences').textContent = String(r.summary.absentDays);
    document.getElementById('sumOddPunches').textContent = String(r.summary.oddPunchDays);

    tbody.replaceChildren();
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    r.days.forEach((d) => {
      const tr = document.createElement('tr');
      const dObj = new Date(d.date + 'T12:00:00Z');
      const dName = dayNames[dObj.getUTCDay()];

      let badge = '<span class="badge badge-success">OK</span>';
      if (d.status === 'AUSENTE') badge = '<span class="badge badge-danger">Ausente</span>';
      if (d.status === 'FRANCO') badge = '<span class="badge badge-info">Franco</span>';
      if (d.status === 'FICHADA_INCOMPLETA') badge = '<span class="badge badge-warning">⚠️ Fichada Impar</span>';
      if (d.status === 'LLEGADA_TARDE') badge = `<span class="badge badge-warning">Tarde (+${d.lateMinutes}m)</span>`;

      let pairsHtml = '-';
      if (d.pairs && d.pairs.length > 0) {
        pairsHtml = d.pairs.map((p) => {
          const inT = p.in ? p.in.localTime : '?';
          const outT = p.out ? p.out.localTime : '<span style="color:var(--cc-danger); font-weight:600;">Sin Salida</span>';
          return `<b>${inT}</b> ➔ <b>${outT}</b>`;
        }).join('<br>');
      }

      Sanitizer.safeSetInnerHTML(
        tr,
        `
        <td><b>${Sanitizer.escapeHTML(d.date)}</b></td>
        <td>${dName}</td>
        <td>${badge}</td>
        <td>${pairsHtml}</td>
        <td><small>${Sanitizer.escapeHTML(d.branchesVisited.join(', ') || '-')}</small></td>
        <td>${d.lateMinutes > 0 ? `+${d.lateMinutes}m` : '-'}</td>
        <td>${d.normalHours} h</td>
        <td>${d.overtimeHours > 0 ? `<b style="color:var(--cc-purple)">+${d.overtimeHours} h</b>` : '-'}</td>
        <td><b>${d.hoursWorked} h</b></td>
      `
      );
      tbody.appendChild(tr);
    });
  } catch (err) {
    Sanitizer.safeSetInnerHTML(tbody, `<tr><td colspan="9" style="color: var(--cc-danger);">Error: ${Sanitizer.escapeHTML(err.message)}</td></tr>`);
  }
}

// 5. REGISTROS & FICHADAS (RECTIFICACIÓN)
async function loadLogs() {
  const tbody = document.querySelector('#tblLogs tbody');
  if (!tbody) return;
  Sanitizer.safeSetInnerHTML(tbody, '<tr><td colspan="9" style="text-align: center;">Cargando fichadas...</td></tr>');

  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentLogs = data.logs;
    tbody.replaceChildren();
    const sorted = [...currentLogs].reverse().slice(0, 300);

    sorted.forEach((l) => {
      const tr = document.createElement('tr');
      const originBadge = l.manual ? '<span class="badge badge-warning">✏️ Manual / Editada</span>' : '<span class="badge badge-success">🤖 Anviz Reloj</span>';

      Sanitizer.safeSetInnerHTML(
        tr,
        `
        <td><b>${Sanitizer.escapeHTML(l.workno || l.userCode)}</b></td>
        <td><strong>${Sanitizer.escapeHTML(l.employeeName)}</strong></td>
        <td><small>${Sanitizer.escapeHTML(l.department || 'Regondi srl')}</small></td>
        <td>${Sanitizer.escapeHTML(l.localDate)}</td>
        <td><b>${Sanitizer.escapeHTML(l.localTime)}</b></td>
        <td><span class="badge badge-primary">${Sanitizer.escapeHTML(l.branch)}</span></td>
        <td>${Sanitizer.escapeHTML(l.verifyDesc)}</td>
        <td>${originBadge}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editPunch('${Sanitizer.escapeHTML(l.id)}')">✏️</button>
          <button class="btn btn-danger-outline btn-sm" onclick="deletePunch('${Sanitizer.escapeHTML(l.id)}')">🗑️</button>
        </td>
      `
      );
      tbody.appendChild(tr);
    });
  } catch (err) {
    Sanitizer.safeSetInnerHTML(tbody, `<tr><td colspan="9" style="color: var(--cc-danger);">Error: ${Sanitizer.escapeHTML(err.message)}</td></tr>`);
  }
}

window.editPunch = function(id) {
  const p = currentLogs.find((l) => l.id === id);
  if (!p) return;

  document.getElementById('modalPunchTitle').textContent = 'Rectificar Fichada';
  document.getElementById('punchFieldId').value = p.id;
  document.getElementById('punchFieldBranch').value = p.branch;
  document.getElementById('punchFieldDate').value = p.localDate;
  document.getElementById('punchFieldTime').value = p.localTime;
  document.getElementById('punchFieldNote').value = p.note || '';

  const select = document.getElementById('punchFieldEmp');
  if (select) {
    Sanitizer.safeSetInnerHTML(
      select,
      currentEmployees
        .map(
          (e) => `
      <option value="${e.id}" ${e.id === p.employeeId || e.workno === p.userCode ? 'selected' : ''}>
        ${Sanitizer.escapeHTML(e.name)} (${Sanitizer.escapeHTML(e.workno)})
      </option>
    `
        )
        .join('')
    );
  }

  openModal('modalPunch');
};

window.deletePunch = async function(id) {
  if (!confirm('¿Seguro que deseas eliminar esta fichada?')) return;
  try {
    const res = await fetch(`/api/logs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadLogs();
  } catch (err) {
    alert('Error al borrar: ' + err.message);
  }
};

document.getElementById('formPunch')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('punchFieldId').value;
  const empId = document.getElementById('punchFieldEmp').value;
  const emp = currentEmployees.find((x) => x.id === empId);

  const branch = document.getElementById('punchFieldBranch').value;
  const dateVal = document.getElementById('punchFieldDate').value;
  const timeVal = document.getElementById('punchFieldTime').value;
  const note = document.getElementById('punchFieldNote').value;

  const fullTimestamp = new Date(`${dateVal}T${timeVal}-03:00`).toISOString();

  try {
    if (id) {
      await fetch(`/api/logs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: fullTimestamp, branch, note })
      });
    } else {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userCode: emp ? emp.workno : '1',
          branch,
          timestamp: fullTimestamp,
          verifyDesc: 'Manual',
          manual: true,
          note
        })
      });
    }
    closeModal('modalPunch');
    loadLogs();
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

// 6. EMPLEADOS (CRUD)
async function loadEmployees() {
  const tbody = document.querySelector('#tblEmployees tbody');
  if (!tbody) return;
  Sanitizer.safeSetInnerHTML(tbody, '<tr><td colspan="9" style="text-align: center;">Cargando personal...</td></tr>');

  try {
    const res = await fetch('/api/employees');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentEmployees = data.employees;
    tbody.replaceChildren();

    currentEmployees.forEach((emp) => {
      const tr = document.createElement('tr');
      Sanitizer.safeSetInnerHTML(
        tr,
        `
        <td><b>${Sanitizer.escapeHTML(emp.workno)}</b></td>
        <td><strong>${Sanitizer.escapeHTML(emp.name)}</strong></td>
        <td>${Sanitizer.escapeHTML(emp.department || 'Regondi srl')}</td>
        <td>${Sanitizer.escapeHTML(emp.position || '-')}</td>
        <td>${Sanitizer.escapeHTML(emp.tel || '-')}</td>
        <td>${emp.hasFinger ? '✅' : '❌'}</td>
        <td>${emp.hasPassd ? '✅' : '❌'}</td>
        <td><span class="badge badge-success">Activo</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editEmployee('${Sanitizer.escapeHTML(emp.id)}')">✏️</button>
          <button class="btn btn-danger-outline btn-sm" onclick="deleteEmployee('${Sanitizer.escapeHTML(emp.id)}')">🗑️</button>
        </td>
      `
      );
      tbody.appendChild(tr);
    });
  } catch (err) {
    Sanitizer.safeSetInnerHTML(tbody, `<tr><td colspan="9" style="color: var(--cc-danger);">Error: ${Sanitizer.escapeHTML(err.message)}</td></tr>`);
  }
}

window.editEmployee = function(id) {
  const emp = currentEmployees.find((e) => e.id === id);
  if (!emp) return;

  document.getElementById('modalEmpTitle').textContent = 'Editar Empleado';
  document.getElementById('empFieldId').value = emp.id;
  document.getElementById('empFieldName').value = emp.name;
  document.getElementById('empFieldWorkno').value = emp.workno;
  document.getElementById('empFieldDept').value = emp.department || 'Regondi srl';
  document.getElementById('empFieldPosition').value = emp.position || '';

  openModal('modalEmployee');
};

window.deleteEmployee = async function(id) {
  if (!confirm('¿Seguro que deseas dar de baja este empleado?')) return;
  try {
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadEmployees();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
};

document.getElementById('formEmployee')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const empData = {
    id: document.getElementById('empFieldId').value || undefined,
    name: document.getElementById('empFieldName').value,
    workno: document.getElementById('empFieldWorkno').value,
    department: document.getElementById('empFieldDept').value,
    position: document.getElementById('empFieldPosition').value
  };

  try {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empData)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    closeModal('modalEmployee');
    loadEmployees();
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

// Botón Probar Enlace Local con Reloj Anviz Neuquen 959
document.getElementById('btnTestClockDirect')?.addEventListener('click', async () => {
  alert('Probando comunicación TCP directa con Anviz Neuquen 959 (192.168.0.218:5010)...');
  try {
    const res = await fetch('/api/scanner/test-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: '192.168.0.218', port: 5010 })
    });
    const data = await res.json();
    if (data.result && data.result.found) {
      alert(`¡Éxito de Conexión!\n${data.result.info}\nDevice ID: ${data.result.devId}`);
    } else {
      alert('No se pudo establecer el enlace con el reloj.');
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
});

// Sincronizar con CrossChex Cloud
document.getElementById('btnSyncCloud')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnSyncCloud');
  if (btn) btn.textContent = '⏳ Sincronizando...';
  try {
    const res = await fetch('/api/cloud/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: '2026-10-01T00:00:00-03:00', endDate: '2026-10-30T23:59:59-03:00' })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    alert(`¡Sincronización Cloud Exitosa!\n• Dispositivos: ${data.result.devicesCount}\n• Empleados: ${data.result.employeesSynced}\n• Fichadas Totales: ${data.result.recordsTotal}`);
    loadDashboard();
  } catch (e) {
    alert('Aviso de sincronización: ' + e.message);
  } finally {
    if (btn) btn.textContent = '🔄 Sincronizar Cloud';
  }
});

// Exportar CSV nativo con BOM UTF-8
document.getElementById('btnExportCSV')?.addEventListener('click', () => {
  if (!lastReport) {
    alert('Primero calcula un reporte');
    return;
  }
  const r = lastReport;
  const headers = ['Fecha', 'Dia', 'Estado', 'Entrada', 'Salida', 'Hs Normales', 'Hs Extra', 'Total Hs', 'Sucursales'];
  const rows = [headers];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  r.days.forEach((d) => {
    const dObj = new Date(d.date + 'T12:00:00Z');
    rows.push([
      d.date,
      dayNames[dObj.getUTCDay()],
      d.status,
      d.firstIn || '-',
      d.lastOut || '-',
      String(d.normalHours),
      String(d.overtimeHours),
      String(d.hoursWorked),
      `"${d.branchesVisited.join(' - ')}"`
    ]);
  });

  const csvContent = '\uFEFF' + rows.map((e) => e.join(';')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Reporte_${r.employee.name.replace(/\s+/g, '_')}_${r.range.startDate}_${r.range.endDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Inicialización
(async function init() {
  await loadEmployees();
  await loadDashboard();
})();
