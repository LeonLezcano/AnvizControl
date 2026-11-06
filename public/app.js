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
    const tag = (element.tagName || '').toUpperCase();
    let wrappedHTML = rawHTML;
    let selector = 'body';

    if (tag === 'TR') {
      wrappedHTML = `<table><tbody><tr>${rawHTML}</tr></tbody></table>`;
      selector = 'tr';
    } else if (tag === 'TBODY' || tag === 'THEAD' || tag === 'TFOOT') {
      wrappedHTML = `<table><tbody>${rawHTML}</tbody></table>`;
      selector = 'tbody';
    } else if (tag === 'TABLE') {
      wrappedHTML = `<table>${rawHTML}</table>`;
      selector = 'table';
    } else if (tag === 'SELECT') {
      wrappedHTML = `<select>${rawHTML}</select>`;
      selector = 'select';
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(wrappedHTML, 'text/html');

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

    const root = doc.querySelector(selector) || doc.body;
    element.replaceChildren(...Array.from(root.childNodes));
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
let lastReportMode = 'ALL';

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
    `
    <option value="ALL">👥 Toda la Plantilla (Consolidado General)</option>
    ` +
      currentEmployees
        .map(
          (e) => `
      <option value="${e.id}">${Sanitizer.escapeHTML(e.name)} (Legajo: ${Sanitizer.escapeHTML(e.workno)})</option>
    `
        )
        .join('')
  );

  runReport();
}

async function runReport() {
  const empId = document.getElementById('repEmployeeSelect')?.value || 'ALL';
  const start = document.getElementById('repStartDate')?.value;
  const end = document.getElementById('repEndDate')?.value;
  const tbody = document.querySelector('#tblReportDetails tbody');
  const thead = document.getElementById('tblReportHead');
  if (!tbody || !start || !end) return;

  Sanitizer.safeSetInnerHTML(
    tbody,
    '<tr><td colspan="10" style="text-align: center; padding: 24px; color: var(--cc-text-secondary);">Calculando asistencia de ambas sucursales...</td></tr>'
  );

  try {
    const res = await fetch(`/api/reports/attendance?employeeId=${empId}&startDate=${start}&endDate=${end}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    lastReport = data.report;
    lastReportMode = data.mode || (empId === 'ALL' ? 'ALL' : 'SINGLE');
    const r = data.report;

    // Actualizar encabezados de impresión y PDF
    const printDate = document.getElementById('printDocDate');
    const printRange = document.getElementById('printDocRange');
    const printScope = document.getElementById('printDocScope');
    const printSign = document.getElementById('printSignEmpName');

    if (printDate) printDate.textContent = new Date().toLocaleDateString('es-AR');
    if (printRange) printRange.textContent = `${start} al ${end}`;

    if (lastReportMode === 'ALL') {
      // 1. MODO CONSOLIDADO: TODA LA PLANTILLA DE EMPLEADOS
      if (printScope) printScope.textContent = `Plantilla Completa de Personal (${r.companyTotals.totalEmployees} empleados)`;
      if (printSign) printSign.textContent = 'Supervisor de Planta / Control';

      // KPI cards de la empresa
      const t1 = document.getElementById('kpiTitle1');
      const t2 = document.getElementById('kpiTitle2');
      const t3 = document.getElementById('kpiTitle3');
      const t4 = document.getElementById('kpiTitle4');
      if (t1) t1.textContent = 'Total Horas Plantilla';
      if (t2) t2.textContent = 'Plantilla con Asistencia';
      if (t3) t3.textContent = 'Ausencias Globales';
      if (t4) t4.textContent = 'Horas Extras Totales';

      document.getElementById('sumTotalHours').textContent = `${r.companyTotals.totalHours} h`;
      document.getElementById('sumDaysWorked').textContent = `${r.companyTotals.employeesWithAttendance} / ${r.companyTotals.totalEmployees}`;
      document.getElementById('sumAbsences').textContent = String(r.companyTotals.totalAbsentDays);
      document.getElementById('sumOddPunches').textContent = `${r.companyTotals.totalOvertimeHours} h`;

      // Header de tabla consolidada
      if (thead) {
        Sanitizer.safeSetInnerHTML(
          thead,
          `
          <tr>
            <th>Legajo</th>
            <th>Empleado</th>
            <th>Departamento</th>
            <th>Días Trab.</th>
            <th>Ausencias</th>
            <th>Tardanzas</th>
            <th>Hs Normales</th>
            <th>Hs Extra</th>
            <th>Total Horas</th>
            <th class="no-print" style="text-align: center;">Acciones</th>
          </tr>
        `
        );
      }

      tbody.replaceChildren();
      r.summary.forEach((s) => {
        const tr = document.createElement('tr');
        Sanitizer.safeSetInnerHTML(
          tr,
          `
          <td><code>${Sanitizer.escapeHTML(s.workno)}</code></td>
          <td><strong>${Sanitizer.escapeHTML(s.name)}</strong></td>
          <td>${Sanitizer.escapeHTML(s.department)}</td>
          <td><b>${s.daysWorked}</b> d</td>
          <td>${s.absentDays > 0 ? `<span class="badge badge-danger">${s.absentDays}</span>` : '-'}</td>
          <td>${s.lateDays > 0 ? `<span class="badge badge-warning">${s.lateDays}</span>` : '-'}</td>
          <td>${s.normalHours} h</td>
          <td>${s.overtimeHours > 0 ? `<b style="color:var(--cc-purple)">+${s.overtimeHours} h</b>` : '-'}</td>
          <td><strong style="color:var(--cc-primary); font-size: 0.95rem;">${s.totalHours} h</strong></td>
          <td class="no-print" style="text-align: center; white-space: nowrap;">
            <button class="btn btn-outline btn-sm" onclick="viewSingleEmployeeReport('${s.id}')" title="Ver desglose diario de este empleado">🔍 Detalle</button>
            <button class="btn btn-outline btn-sm" onclick="exportSingleEmployeeCSV('${s.id}')" title="Descargar Excel individual">📥 Excel</button>
            <button class="btn btn-outline btn-sm" onclick="printSingleEmployee('${s.id}')" title="Imprimir / PDF individual">🖨️ PDF</button>
          </td>
        `
        );
        tbody.appendChild(tr);
      });
    } else {
      // 2. MODO INDIVIDUAL: UN SOLO EMPLEADO
      if (printScope) printScope.textContent = `Planilla Individual: ${r.employee.name} (Legajo: ${r.employee.workno} - ${r.employee.department})`;
      if (printSign) printSign.textContent = `Firma de ${r.employee.name}`;

      // KPI cards de un solo empleado
      const t1 = document.getElementById('kpiTitle1');
      const t2 = document.getElementById('kpiTitle2');
      const t3 = document.getElementById('kpiTitle3');
      const t4 = document.getElementById('kpiTitle4');
      if (t1) t1.textContent = 'Total Horas Trabajadas';
      if (t2) t2.textContent = 'Días Trabajados';
      if (t3) t3.textContent = 'Ausencias';
      if (t4) t4.textContent = 'Fichadas Impares (Sin salida)';

      document.getElementById('sumTotalHours').textContent = `${r.summary.totalHours} h`;
      document.getElementById('sumDaysWorked').textContent = String(r.summary.daysWorked);
      document.getElementById('sumAbsences').textContent = String(r.summary.absentDays);
      document.getElementById('sumOddPunches').textContent = String(r.summary.oddPunchDays);

      // Header de tabla individual
      if (thead) {
        Sanitizer.safeSetInnerHTML(
          thead,
          `
          <tr>
            <th>Fecha</th>
            <th>Día</th>
            <th>Estado</th>
            <th>Pares Entrada ➔ Salida</th>
            <th>Sucursales</th>
            <th>Llegada Tarde</th>
            <th>Hs Normales</th>
            <th>Hs Extra</th>
            <th>Total Horas</th>
          </tr>
        `
        );
      }

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
          pairsHtml = d.pairs
            .map((p) => {
              const inT = p.in ? p.in.localTime : '?';
              const outT = p.out ? p.out.localTime : '<span style="color:var(--cc-danger); font-weight:600;">Sin Salida</span>';
              return `<b>${inT}</b> ➔ <b>${outT}</b>`;
            })
            .join('<br>');
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
    }
  } catch (err) {
    Sanitizer.safeSetInnerHTML(
      tbody,
      `<tr><td colspan="10" style="color: var(--cc-danger); padding: 18px;">Error: ${Sanitizer.escapeHTML(err.message)}</td></tr>`
    );
  }
}

window.viewSingleEmployeeReport = function(empId) {
  const select = document.getElementById('repEmployeeSelect');
  if (select) {
    select.value = empId;
    runReport();
  }
};

// 5. REGISTROS & FICHADAS (RECTIFICACIÓN)
function renderLogsTable(logsToRender) {
  const tbody = document.querySelector('#tblLogs tbody');
  if (!tbody) return;
  tbody.replaceChildren();

  if (!logsToRender || logsToRender.length === 0) {
    Sanitizer.safeSetInnerHTML(
      tbody,
      '<tr><td colspan="9" style="text-align: center; color: var(--cc-text-secondary); padding: 24px;">No se encontraron fichadas con los filtros seleccionados.</td></tr>'
    );
    return;
  }

  const sorted = [...logsToRender].reverse().slice(0, 300);

  sorted.forEach((l) => {
    const tr = document.createElement('tr');
    const originBadge = l.manual
      ? '<span class="badge badge-warning">✏️ Manual / Editada</span>'
      : '<span class="badge badge-success">🤖 Anviz Reloj</span>';

    Sanitizer.safeSetInnerHTML(
      tr,
      `
      <td><code>${Sanitizer.escapeHTML(l.workno || l.userCode)}</code></td>
      <td><strong>${Sanitizer.escapeHTML(l.employeeName || 'Empleado ' + (l.workno || l.userCode))}</strong></td>
      <td><small style="color: var(--cc-text-secondary);">${Sanitizer.escapeHTML(l.department || 'Regondi srl')}</small></td>
      <td><span style="font-family: monospace;">${Sanitizer.escapeHTML(l.localDate)}</span></td>
      <td><b style="font-family: monospace; color: var(--cc-text-primary);">${Sanitizer.escapeHTML(l.localTime)}</b></td>
      <td><span class="badge badge-primary">${Sanitizer.escapeHTML(l.branch)}</span></td>
      <td><small>${Sanitizer.escapeHTML(l.verifyDesc)}</small></td>
      <td>${originBadge}</td>
      <td style="white-space: nowrap;">
        <button class="btn btn-outline btn-sm" data-action="edit-punch" data-id="${Sanitizer.escapeHTML(l.id)}" title="Rectificar">✏️</button>
        <button class="btn btn-danger-outline btn-sm" data-action="delete-punch" data-id="${Sanitizer.escapeHTML(l.id)}" title="Eliminar">🗑️</button>
      </td>
    `
    );
    tbody.appendChild(tr);
  });
}

function applyLogsFilters() {
  const q = (document.getElementById('searchLogsText')?.value || '').toLowerCase().trim();
  const b = (document.getElementById('filterLogsBranch')?.value || '').toLowerCase().trim();
  const d = (document.getElementById('filterLogsDate')?.value || '').trim();

  let filtered = currentLogs;
  if (q) {
    filtered = filtered.filter((l) => {
      const code = String(l.workno || l.userCode || '').toLowerCase();
      const name = String(l.employeeName || '').toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }
  if (b) {
    filtered = filtered.filter((l) => String(l.branch || '').toLowerCase().includes(b));
  }
  if (d) {
    filtered = filtered.filter((l) => String(l.localDate || '').startsWith(d));
  }

  renderLogsTable(filtered);
}

document.getElementById('searchLogsText')?.addEventListener('input', applyLogsFilters);
document.getElementById('filterLogsBranch')?.addEventListener('change', applyLogsFilters);
document.getElementById('filterLogsDate')?.addEventListener('change', applyLogsFilters);
document.getElementById('btnClearLogsFilter')?.addEventListener('click', () => {
  const searchInput = document.getElementById('searchLogsText');
  const branchSelect = document.getElementById('filterLogsBranch');
  const dateInput = document.getElementById('filterLogsDate');
  if (searchInput) searchInput.value = '';
  if (branchSelect) branchSelect.value = '';
  if (dateInput) dateInput.value = '';
  renderLogsTable(currentLogs);
});

async function loadLogs() {
  const tbody = document.querySelector('#tblLogs tbody');
  if (!tbody) return;
  Sanitizer.safeSetInnerHTML(tbody, '<tr><td colspan="9" style="text-align: center;">Cargando fichadas...</td></tr>');

  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentLogs = data.logs;
    applyLogsFilters();
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

// Delegación de eventos para acciones en tabla de fichadas (✏️ y 🗑️)
document.getElementById('tblLogs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  if (action === 'edit-punch' && id) window.editPunch(id);
  if (action === 'delete-punch' && id) window.deletePunch(id);
});

// Apertura de modal para nueva fichada manual
document.getElementById('btnOpenNewPunchModal')?.addEventListener('click', () => {
  document.getElementById('formPunch')?.reset();
  document.getElementById('punchFieldId').value = '';
  document.getElementById('modalPunchTitle').textContent = 'Fichada Manual / Rectificación';

  const select = document.getElementById('punchFieldEmp');
  if (select && currentEmployees.length > 0) {
    Sanitizer.safeSetInnerHTML(
      select,
      currentEmployees
        .map(
          (e) => `
      <option value="${e.id}">
        ${Sanitizer.escapeHTML(e.name)} (${Sanitizer.escapeHTML(e.workno)})
      </option>
    `
        )
        .join('')
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('punchFieldDate').value = `${year}-${month}-${day}`;
  document.getElementById('punchFieldTime').value = `${hours}:${minutes}`;
  openModal('modalPunch');
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
          <button class="btn btn-outline btn-sm" data-action="enroll-employee" data-id="${Sanitizer.escapeHTML(emp.id)}" data-workno="${Sanitizer.escapeHTML(emp.workno)}" title="Tomar Huella en Reloj">☝️ Huella</button>
          <button class="btn btn-outline btn-sm" data-action="edit-employee" data-id="${Sanitizer.escapeHTML(emp.id)}" title="Editar Empleado">✏️</button>
          <button class="btn btn-danger-outline btn-sm" data-action="delete-employee" data-id="${Sanitizer.escapeHTML(emp.id)}" title="Eliminar Empleado">🗑️</button>
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

  const statusBadge = document.getElementById('enrollCurrentStatus');
  if (statusBadge) {
    if (emp.hasFinger) {
      statusBadge.className = 'badge badge-success';
      statusBadge.textContent = '✅ Huella Registrada';
    } else {
      statusBadge.className = 'badge badge-warning';
      statusBadge.textContent = '❌ Sin Huella';
    }
  }

  const feedbackText = document.getElementById('enrollFeedbackText');
  if (feedbackText) {
    Sanitizer.safeSetInnerHTML(
      feedbackText,
      `Empleado: <strong>${Sanitizer.escapeHTML(emp.name)}</strong> (Legajo <strong>${Sanitizer.escapeHTML(emp.workno)}</strong>). Seleccione la sucursal y presione <strong>"Iniciar Toma de Huella"</strong>. El aparato dirá en voz alta <em>"Coloque su dedo"</em>.`
    );
  }

  openModal('modalEmployee');
};

window.enrollEmployee = function(id) {
  window.editEmployee(id);
  const btnEnroll = document.getElementById('btnTriggerModalEnroll');
  if (btnEnroll) {
    btnEnroll.scrollIntoView({ behavior: 'smooth', block: 'center' });
    btnEnroll.focus();
  }
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

// Delegación de eventos para acciones en tabla de empleados (☝️, ✏️ y 🗑️)
document.getElementById('tblEmployees')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  if (action === 'enroll-employee' && id) window.enrollEmployee(id);
  if (action === 'edit-employee' && id) window.editEmployee(id);
  if (action === 'delete-employee' && id) window.deleteEmployee(id);
});

// Apertura de modal para nuevo empleado
document.getElementById('btnOpenNewEmpModal')?.addEventListener('click', () => {
  document.getElementById('formEmployee')?.reset();
  document.getElementById('empFieldId').value = '';
  document.getElementById('modalEmpTitle').textContent = 'Nuevo Empleado';
  document.getElementById('empFieldDept').value = 'Regondi srl';

  const statusBadge = document.getElementById('enrollCurrentStatus');
  if (statusBadge) {
    statusBadge.className = 'badge badge-outline';
    statusBadge.textContent = 'Sin registrar';
  }

  const feedbackText = document.getElementById('enrollFeedbackText');
  if (feedbackText) {
    feedbackText.innerHTML = `
      Al presionar <strong>"Iniciar Toma de Huella"</strong>, el aparato físico dirá en voz alta <em>"Coloque su dedo"</em> y encenderá la luz verde. El operario debe apoyar el dedo 2 a 3 veces hasta escuchar el pitido.
    `;
  }

  openModal('modalEmployee');
});

// Botón de Enrolamiento de Huella Remoto en Reloj Físico (Comando 0x5C)
document.getElementById('btnTriggerModalEnroll')?.addEventListener('click', async () => {
  const workno = document.getElementById('empFieldWorkno')?.value?.trim();
  const name = document.getElementById('empFieldName')?.value?.trim();
  const empId = document.getElementById('empFieldId')?.value || undefined;
  const branchSelect = document.getElementById('empEnrollBranch');
  const slotSelect = document.getElementById('empEnrollFingerSlot');

  if (!workno) {
    alert('Por favor ingrese primero el número de Legajo / ID Reloj del empleado.');
    document.getElementById('empFieldWorkno')?.focus();
    return;
  }

  const branchName = branchSelect?.options[branchSelect.selectedIndex]?.text || 'Neuquén 959';
  const deviceId = branchSelect?.value || '1930';
  const backupId = Number(slotSelect?.value) || 0;

  const btn = document.getElementById('btnTriggerModalEnroll');
  const feedbackText = document.getElementById('enrollFeedbackText');
  const statusBadge = document.getElementById('enrollCurrentStatus');

  const origBtnContent = btn.innerHTML;
  btn.disabled = true;
  Sanitizer.safeSetInnerHTML(btn, '<span>⏳</span> Enviando comando al reloj...');

  if (feedbackText) {
    Sanitizer.safeSetInnerHTML(
      feedbackText,
      `
      <div style="color: var(--cc-primary); font-weight: 600; margin-bottom: 4px;">
        ⏳ Conectando con el reloj VF30 Pro en ${Sanitizer.escapeHTML(branchName)}...
      </div>
      <div>Preparando sensor óptico y activando altavoz del equipo...</div>
    `
    );
  }

  try {
    const res = await fetch('/api/devices/enroll-fingerprint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: empId,
        workno,
        name,
        branch: branchName,
        deviceId,
        backupId
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Error al conectar con el reloj');

    if (statusBadge) {
      statusBadge.className = 'badge badge-success';
      statusBadge.textContent = '✅ Huella Registrada';
    }

    if (feedbackText) {
      Sanitizer.safeSetInnerHTML(
        feedbackText,
        `
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #047863; font-size: 0.9rem; margin-bottom: 6px;">
          <span style="font-size: 1.2rem;">🔊</span> Reloj emitiendo voz: "Coloque su dedo"
        </div>
        <div style="font-size: 0.82rem; color: var(--cc-text-primary); margin-bottom: 8px;">
          <strong>Paso a paso en el reloj (${Sanitizer.escapeHTML(data.device)}):</strong>
        </div>
        <ol style="margin: 0; padding-left: 20px; font-size: 0.8rem; color: var(--cc-text-regular); display: flex; flex-direction: column; gap: 4px;">
          <li>El empleado apoya el dedo sobre el lector óptico con luz verde.</li>
          <li>Al escuchar el pitido del reloj, levanta y vuelve a apoyar el dedo (2 o 3 veces).</li>
          <li>El reloj confirmará con la voz <em>"Éxito"</em> o <em>"Verificado"</em> y quedará grabado.</li>
        </ol>
        <div style="margin-top: 8px; font-size: 0.76rem; color: var(--cc-text-secondary); border-top: 1px solid #e2e8f0; padding-top: 6px;">
          Estado: <strong>${Sanitizer.escapeHTML(data.triggerResult?.message || 'Comando recibido')}</strong> • Legajo: <strong>${Sanitizer.escapeHTML(workno)}</strong>
        </div>
      `
      );
    }

    loadEmployees();
  } catch (err) {
    if (feedbackText) {
      Sanitizer.safeSetInnerHTML(
        feedbackText,
        `
        <div style="color: var(--cc-danger); font-weight: 600;">
          ❌ No se pudo conectar al reloj: ${Sanitizer.escapeHTML(err.message)}
        </div>
        <div style="margin-top: 4px; font-size: 0.78rem;">
          Verifique que el reloj esté encendido y conectado en la red local. También puede ingresar el legajo <strong>${Sanitizer.escapeHTML(workno)}</strong> manualmente en el teclado del equipo.
        </div>
      `
      );
    }
  } finally {
    btn.disabled = false;
    Sanitizer.safeSetInnerHTML(btn, origBtnContent);
  }
});

// Cierre táctil o por click en backdrop de modales
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
    }
  });
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

// ==========================================
// EXPORTACIÓN A EXCEL (CSV UTF-8 BOM) Y PDF (PRINT)
// ==========================================

// Helper universal para descargar archivos CSV con BOM UTF-8 (Directiva 17)
function downloadCSV(filename, rows) {
  const csvContent =
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell === null || cell === undefined ? '' : cell);
            if (str.includes(';') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(';')
      )
      .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 1. Exportar reporte actual (Consolidado o Individual según modo activo)
function exportCurrentCSV() {
  if (!lastReport) {
    alert('Primero genere o calcule un reporte de asistencia.');
    return;
  }
  const r = lastReport;

  if (lastReportMode === 'ALL') {
    const headers = [
      'Legajo',
      'Empleado',
      'Departamento',
      'Cargo',
      'Dias Trabajados',
      'Ausencias',
      'Llegadas Tarde',
      'Hs Normales',
      'Hs Extra',
      'Total Horas'
    ];
    const rows = [headers];
    r.summary.forEach((s) => {
      rows.push([
        s.workno,
        s.name,
        s.department,
        s.position || '',
        s.daysWorked,
        s.absentDays,
        s.lateDays,
        s.normalHours,
        s.overtimeHours,
        s.totalHours
      ]);
    });
    // Fila resumen de totales
    rows.push([
      'TOTALES',
      `${r.companyTotals.totalEmployees} Empleados`,
      'Regondi srl',
      '-',
      r.companyTotals.employeesWithAttendance,
      r.companyTotals.totalAbsentDays,
      r.companyTotals.totalLateDays,
      r.companyTotals.totalNormalHours,
      r.companyTotals.totalOvertimeHours,
      r.companyTotals.totalHours
    ]);
    downloadCSV(`Planilla_Consolidada_Regondi_${r.range.startDate}_${r.range.endDate}.csv`, rows);
  } else {
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
        d.branchesVisited.join(' - ')
      ]);
    });
    downloadCSV(`Planilla_${r.employee.name.replace(/\s+/g, '_')}_${r.range.startDate}_${r.range.endDate}.csv`, rows);
  }
}

// 2. Exportar todas las jornadas detalladas de toda la plantilla en un único CSV de Excel
async function exportAllDetailedCSV() {
  const start = document.getElementById('repStartDate')?.value;
  const end = document.getElementById('repEndDate')?.value;
  if (!start || !end) return;

  let allRep = lastReportMode === 'ALL' && lastReport?.reports ? lastReport : null;
  if (!allRep) {
    const res = await fetch(`/api/reports/attendance?employeeId=ALL&startDate=${start}&endDate=${end}`);
    const data = await res.json();
    if (!data.success) {
      alert('Error al calcular planilla completa: ' + data.error);
      return;
    }
    allRep = data.report;
  }

  const headers = [
    'Legajo',
    'Empleado',
    'Departamento',
    'Fecha',
    'Dia',
    'Estado',
    'Entrada',
    'Salida',
    'Tardanza (min)',
    'Hs Normales',
    'Hs Extra',
    'Total Horas',
    'Sucursales'
  ];
  const rows = [headers];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  allRep.reports.forEach((empRep) => {
    empRep.days.forEach((d) => {
      const dObj = new Date(d.date + 'T12:00:00Z');
      rows.push([
        empRep.employee.workno,
        empRep.employee.name,
        empRep.employee.department,
        d.date,
        dayNames[dObj.getUTCDay()],
        d.status,
        d.firstIn || '-',
        d.lastOut || '-',
        d.lateMinutes > 0 ? String(d.lateMinutes) : '0',
        String(d.normalHours),
        String(d.overtimeHours),
        String(d.hoursWorked),
        d.branchesVisited.join(' - ')
      ]);
    });
  });

  downloadCSV(`Planilla_Detallada_Todos_Regondi_${start}_${end}.csv`, rows);
}

// 3. Exportar CSV individual para un empleado específico desde la lista
window.exportSingleEmployeeCSV = async function(empId) {
  const start = document.getElementById('repStartDate')?.value;
  const end = document.getElementById('repEndDate')?.value;
  const res = await fetch(`/api/reports/attendance?employeeId=${empId}&startDate=${start}&endDate=${end}`);
  const data = await res.json();
  if (!data.success) {
    alert('Error al obtener reporte: ' + data.error);
    return;
  }
  const r = data.report;
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
      d.branchesVisited.join(' - ')
    ]);
  });
  downloadCSV(`Planilla_${r.employee.name.replace(/\s+/g, '_')}_${start}_${end}.csv`, rows);
};

// 4. Imprimir / PDF de un solo empleado
window.printSingleEmployee = async function(empId) {
  const select = document.getElementById('repEmployeeSelect');
  if (select) {
    select.value = empId;
    await runReport();
    setTimeout(() => {
      window.print();
    }, 150);
  }
};

// 5. Imprimir / PDF en lote: Cada empleado en su propia hoja A4 (page-break-after: always)
async function printBatchIndividual() {
  const start = document.getElementById('repStartDate')?.value;
  const end = document.getElementById('repEndDate')?.value;
  if (!start || !end) return;

  const batchContainer = document.getElementById('batchPrintContainer');
  const mainTable = document.getElementById('reportMainTableContainer');
  const summaryCards = document.getElementById('reportSummaryCards');
  const docHeader = document.getElementById('printDocHeader');
  const docSignatures = document.getElementById('printDocSignatures');

  if (!batchContainer) return;

  let allRep = lastReportMode === 'ALL' && lastReport?.reports ? lastReport : null;
  if (!allRep) {
    const res = await fetch(`/api/reports/attendance?employeeId=ALL&startDate=${start}&endDate=${end}`);
    const data = await res.json();
    if (!data.success) {
      alert('Error al preparar planillas individuales: ' + data.error);
      return;
    }
    allRep = data.report;
  }

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const todayStr = new Date().toLocaleDateString('es-AR');

  const sheetsHtml = allRep.reports
    .map((empRep) => {
      const rowsHtml = empRep.days
        .map((d) => {
          const dObj = new Date(d.date + 'T12:00:00Z');
          const dName = dayNames[dObj.getUTCDay()];
          const inT = d.firstIn || '-';
          const outT = d.lastOut || '-';
          return `
          <tr>
            <td><b>${Sanitizer.escapeHTML(d.date)}</b></td>
            <td>${dName}</td>
            <td>${Sanitizer.escapeHTML(d.status)}</td>
            <td><b>${inT}</b> ➔ <b>${outT}</b></td>
            <td><small>${Sanitizer.escapeHTML(d.branchesVisited.join(', ') || '-')}</small></td>
            <td>${d.lateMinutes > 0 ? `+${d.lateMinutes}m` : '-'}</td>
            <td>${d.normalHours} h</td>
            <td>${d.overtimeHours > 0 ? `+${d.overtimeHours} h` : '-'}</td>
            <td><b>${d.hoursWorked} h</b></td>
          </tr>
        `;
        })
        .join('');

      return `
        <div class="employee-sheet">
          <div style="border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <h2 style="margin: 0; font-size: 14pt; color: #000; text-transform: uppercase;">REGONDI SRL</h2>
                <div style="font-size: 9pt; color: #222; font-weight: 600;">Planilla Individual de Asistencia y Control Horario</div>
                <div style="font-size: 8pt; color: #666;">CrossChex Control • Sistema Biométrico Anviz</div>
              </div>
              <div style="text-align: right; font-size: 8pt;">
                <div><strong>Fecha de Emisión:</strong> ${todayStr}</div>
                <div><strong>Período:</strong> ${start} al ${end}</div>
              </div>
            </div>
            <div style="margin-top: 6px; padding: 6px 10px; background: #f8fafc; border: 1px solid #cbd5e1; font-size: 8.5pt; display: flex; gap: 20px;">
              <div><strong>Empleado:</strong> ${Sanitizer.escapeHTML(empRep.employee.name)}</div>
              <div><strong>Legajo:</strong> ${Sanitizer.escapeHTML(empRep.employee.workno)}</div>
              <div><strong>DNI:</strong> ${Sanitizer.escapeHTML(empRep.employee.dni)}</div>
              <div><strong>Departamento:</strong> ${Sanitizer.escapeHTML(empRep.employee.department)}</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px;">
            <div style="border: 1px solid #cbd5e1; padding: 4px 8px; font-size: 8pt;">
              <span style="color:#555;">Total Horas:</span> <b>${empRep.summary.totalHours} h</b>
            </div>
            <div style="border: 1px solid #cbd5e1; padding: 4px 8px; font-size: 8pt;">
              <span style="color:#555;">Días Trabajados:</span> <b>${empRep.summary.daysWorked}</b>
            </div>
            <div style="border: 1px solid #cbd5e1; padding: 4px 8px; font-size: 8pt;">
              <span style="color:#555;">Ausencias:</span> <b>${empRep.summary.absentDays}</b>
            </div>
            <div style="border: 1px solid #cbd5e1; padding: 4px 8px; font-size: 8pt;">
              <span style="color:#555;">Horas Extra:</span> <b>${empRep.summary.totalOvertimeHours} h</b>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 8pt;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="border: 1px solid #666; padding: 3px 5px;">Fecha</th>
                <th style="border: 1px solid #666; padding: 3px 5px;">Día</th>
                <th style="border: 1px solid #666; padding: 3px 5px;">Estado</th>
                <th style="border: 1px solid #666; padding: 3px 5px;">Pares Entrada ➔ Salida</th>
                <th style="border: 1px solid #666; padding: 3px 5px;">Sucursal</th>
                <th style="border: 1px solid #666; padding: 3px 5px;">Tarde</th>
                <th style="border: 1px solid #666; padding: 3px 5px;">Hs Norm.</th>
                <th style="border: 1px solid #666; padding: 3px 5px;">Hs Ext.</th>
                <th style="border: 1px solid #666; padding: 3px 5px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="signature-block" style="margin-top: 25px; display: flex; justify-content: space-around; text-align: center;">
            <div style="width: 200px; border-top: 1px solid #333; padding-top: 4px; font-size: 8pt;">
              <strong>Firma de ${Sanitizer.escapeHTML(empRep.employee.name)}</strong><br>
              <span style="font-size: 7pt; color: #555;">Conformidad del Empleado</span>
            </div>
            <div style="width: 200px; border-top: 1px solid #333; padding-top: 4px; font-size: 8pt;">
              <strong>Recursos Humanos / Dirección</strong><br>
              <span style="font-size: 7pt; color: #555;">Regondi srl</span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  Sanitizer.safeSetInnerHTML(batchContainer, sheetsHtml);

  // Ocultar vista normal de pantalla durante impresión en lote
  if (mainTable) mainTable.style.setProperty('display', 'none', 'important');
  if (summaryCards) summaryCards.style.setProperty('display', 'none', 'important');
  if (docHeader) docHeader.style.setProperty('display', 'none', 'important');
  if (docSignatures) docSignatures.style.setProperty('display', 'none', 'important');
  batchContainer.style.setProperty('display', 'block', 'important');

  const cleanup = () => {
    if (mainTable) mainTable.style.removeProperty('display');
    if (summaryCards) summaryCards.style.removeProperty('display');
    if (docHeader) docHeader.style.removeProperty('display');
    if (docSignatures) docSignatures.style.removeProperty('display');
    batchContainer.style.setProperty('display', 'none', 'important');
    Sanitizer.safeSetInnerHTML(batchContainer, '');
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    window.print();
  }, 100);
}

// Event Listeners de Botones de Reporte
document.getElementById('btnExportCSV')?.addEventListener('click', exportCurrentCSV);
document.getElementById('btnExportDetailedAllCSV')?.addEventListener('click', exportAllDetailedCSV);
document.getElementById('btnPrintReport')?.addEventListener('click', () => window.print());
document.getElementById('btnPrintBatchIndividual')?.addEventListener('click', printBatchIndividual);
document.getElementById('repEmployeeSelect')?.addEventListener('change', runReport);
document.getElementById('btnRunReport')?.addEventListener('click', runReport);

// Inicialización
(async function init() {
  await loadEmployees();
  await loadDashboard();
})();
