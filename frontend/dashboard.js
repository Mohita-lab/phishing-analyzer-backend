// ================================================================
// dashboard.js — AIOps Dashboard for Phishing Analyzer
// AXIS IT Security  ·  v1.0
//
// FIX 5: Removed localStorage auth token storage (security risk)
//         Now uses a session-scoped variable only
// FIX 6: API_BASE now points to Render backend, not window.location.origin
//         (dashboard is on Netlify, API is on Render — different servers)
// ================================================================

// ── Configuration ────────────────────────────────────────────────
const API_BASE = 'https://phishing-axis.onrender.com';

let trendsChart          = null;
let riskDistributionChart = null;

// Session-only auth token — not persisted to localStorage
let authToken = '';

// ── Authentication ────────────────────────────────────────────────
function checkAuthentication() {
    if (!authToken) {
        const token = prompt('Enter your dashboard access token:');
        if (token && token.trim()) {
            authToken = token.trim();
            return true;
        } else {
            showError('Authentication required to access the dashboard.');
            return false;
        }
    }
    return true;
}

async function reportPhishing() {
    try {
        if (!currentEmailText || !currentAnalysis) {
            showError('No email data available. Please analyse first.');
            return;
        }

        showLoading('Submitting report…');

        const data = await postToBackend(REPORT_ENDPOINT, {
            sender: currentAnalysis.sender,
            subject: currentAnalysis.subject,
            risk_score: currentAnalysis.risk_score,
            risk_level: currentAnalysis.risk_level,
            analysis_data: currentAnalysis
        });

        hideLoading();

        // ✅ SHOW IN UI (THIS IS WHAT YOU ASKED FOR)
        document.getElementById('report-section').innerHTML = `
            <div class="report-success">
                <h3>✅ Report Sent Successfully</h3>
                <p>Email has been forwarded to security system.</p>
                <p><b>Report ID:</b> ${data.report_id}</p>

                <button id="new-analysis-btn" class="analyze-button">
                    Analyse Another Email
                </button>
            </div>
        `;

        document.getElementById('new-analysis-btn')
            .addEventListener('click', resetAnalysis);

    } catch (err) {
        console.error(err);
        showError('Failed to submit report');
    }
}
// ── Initialization ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Prompt for token before loading anything
    if (!checkAuthentication()) {
        return;
    }

    loadDashboardData();

    document.getElementById('refresh-btn')
        .addEventListener('click', loadDashboardData);

    document.getElementById('time-range')
        .addEventListener('change', loadDashboardData);

    // Auto-refresh every 5 minutes
    setInterval(loadDashboardData, 5 * 60 * 1000);
});

// ── Load all dashboard data ───────────────────────────────────────
async function loadDashboardData() {
    const days = document.getElementById('time-range').value;

    // Show loading state on cards
    ['total-analyses', 'phishing-count', 'avg-risk-score', 'report-count']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '...';
        });

    try {
        const [overview, trends, topSenders, topIndicators, alerts] =
            await Promise.all([
                authenticatedFetch(`${API_BASE}/api/analytics/overview?days=${days}`).then(r => r.json()),
                authenticatedFetch(`${API_BASE}/api/analytics/trends?days=${days}`).then(r => r.json()),
                authenticatedFetch(`${API_BASE}/api/analytics/top-senders?days=${days}`).then(r => r.json()),
                authenticatedFetch(`${API_BASE}/api/analytics/top-indicators?days=${days}`).then(r => r.json()),
                authenticatedFetch(`${API_BASE}/api/analytics/recent-alerts?limit=10`).then(r => r.json()),
            ]);

        updateOverview(overview);
        updateTrendsChart(trends);
        updateTopSendersTable(topSenders);
        updateTopIndicatorsTable(topIndicators);
        updateAlerts(alerts);
    } catch (error) {
        console.error('Dashboard load error:', error);
        showError('Failed to load dashboard data: ' + error.message);
    }
}

// ── Overview cards ────────────────────────────────────────────────
function updateOverview(data) {
    document.getElementById('total-analyses').textContent =
        (data.total_analyzed || 0).toLocaleString();
    document.getElementById('phishing-count').textContent =
        (data.phishing_count || 0).toLocaleString();

    const rateEl = document.getElementById('phishing-rate');
    if (rateEl) rateEl.textContent = `${data.phishing_rate || 0}% phishing rate`;

    document.getElementById('avg-risk-score').textContent =
        (data.avg_risk_score || 0).toFixed(1);
    document.getElementById('report-count').textContent =
        (data.report_count || 0).toLocaleString();
}

// ── Trends chart ──────────────────────────────────────────────────
function updateTrendsChart(data) {
    const ctx = document.getElementById('trends-chart').getContext('2d');

    const labels       = Object.keys(data.analyses_by_date || {}).sort();
    const analysesData = labels.map(d => data.analyses_by_date[d] || 0);
    const phishingData = labels.map(d => data.phishing_by_date[d]  || 0);

    if (trendsChart) trendsChart.destroy();

    trendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(formatDate),
            datasets: [
                {
                    label: 'Total Analyses',
                    data: analysesData,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102,126,234,0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Phishing Detected',
                    data: phishingData,
                    borderColor: '#f56565',
                    backgroundColor: 'rgba(245,101,101,0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales:  { y: { beginAtZero: true } }
        }
    });

    if (data.risk_distribution) {
        updateRiskDistributionChart(data.risk_distribution);
    }
}

// ── Risk distribution doughnut ────────────────────────────────────
function updateRiskDistributionChart(riskDistribution) {
    const ctx = document.getElementById('risk-distribution-chart').getContext('2d');

    const labels = Object.keys(riskDistribution);
    const values = Object.values(riskDistribution);
    const colors = { HIGH: '#f56565', MEDIUM: '#ed8936', LOW: '#ecc94b', SAFE: '#48bb78' };

    if (riskDistributionChart) riskDistributionChart.destroy();

    riskDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: labels.map(l => colors[l] || '#667eea') }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });
}

// ── Top senders table ─────────────────────────────────────────────
function updateTopSendersTable(data) {
    const tbody = document.querySelector('#top-senders-table tbody');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="no-data">No data available</td></tr>';
        return;
    }

    data.forEach(sender => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(sender.sender)}</td>
            <td>${sender.email_count}</td>
            <td>${(sender.avg_risk_score || 0).toFixed(1)}</td>
            <td>${(sender.phishing_rate  || 0).toFixed(1)}%</td>`;
        tbody.appendChild(row);
    });
}

// ── Top indicators table ──────────────────────────────────────────
function updateTopIndicatorsTable(data) {
    const tbody = document.querySelector('#top-indicators-table tbody');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="no-data">No data available</td></tr>';
        return;
    }

    data.forEach(indicator => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(indicator.indicator)}</td>
            <td>${indicator.count}</td>`;
        tbody.appendChild(row);
    });
}

// ── Alerts ────────────────────────────────────────────────────────
function updateAlerts(alerts) {
    const container = document.getElementById('alerts-container');
    container.innerHTML = '';

    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="no-data">No recent alerts</div>';
        return;
    }

    alerts.forEach(alert => {
        const div = document.createElement('div');
        div.className = `alert ${alert.severity}`;
        div.innerHTML = `
            <div class="alert-content">
                <div class="alert-type">${formatAlertType(alert.alert_type)}</div>
                <div class="alert-description">${escapeHtml(alert.description)}</div>
            </div>
            <div>
                <span class="alert-severity ${alert.severity}">${alert.severity}</span>
                <span class="alert-timestamp">${formatDate(alert.timestamp)}</span>
            </div>`;
        container.appendChild(div);
    });
}

// ── Utilities ─────────────────────────────────────────────────────
function formatDate(dateString) {
    try {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric'
        });
    } catch { return dateString; }
}

function formatAlertType(type) {
    const map = {
        sender_surge:    '📧 Sender Surge',
        domain_spike:    '🌐 Domain Spike',
        risk_score_spike:'📊 Risk Score Spike'
    };
    return map[type] || type;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

function showError(message) {
    console.error(message);
    // Show error inline rather than alert() which blocks UI
    const container = document.getElementById('alerts-container');
    if (container) {
        container.innerHTML = `
            <div class="alert critical">
                <div class="alert-content">
                    <div class="alert-type">⚠ Dashboard Error</div>
                    <div class="alert-description">${escapeHtml(message)}</div>
                </div>
            </div>`;
    }
}
