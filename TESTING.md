# Local Testing Guide

This guide provides step-by-step instructions for testing the security-hardened Phishing Analyzer system locally.

## Prerequisites

- Python 3.8 or higher
- pip package manager
- Git (optional)

## Setup Steps

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with the following values for local testing:

```bash
# Database Configuration (use SQLite for local testing)
DATABASE_URL=sqlite:///phishing_analyzer.db

# Security Configuration
# Generate a secret key
SECRET_KEY=test-secret-key-for-local-development-only

# Debug mode (enable for local testing)
DEBUG=True

# API Tokens (test tokens for local testing)
# Format: token:role
API_TOKENS=test-admin:local-admin,test-analyst:local-analyst,test-user:local-user

# CORS Configuration (allow localhost for local testing)
ALLOWED_ORIGINS=http://localhost:5000,http://127.0.0.1:5000

# Session Configuration (disable secure flag for HTTP localhost)
SESSION_COOKIE_SECURE=False

# Data Retention
DATA_RETENTION_DAYS=90

# Anomaly Detection Thresholds
SENDER_SURGE_MULTIPLIER=5.0
DOMAIN_SPIKE_MULTIPLIER=3.0
RISK_SCORE_SPIKE=20
MIN_SAMPLES=10

# Server Configuration
PORT=5000
```

### 3. Start the Backend Server

```bash
cd backend
python app.py
```

You should see output like:
```
Routes Loaded:
...
[Background] Scheduler started (anomaly detection, data retention, backup)
 * Running on http://0.0.0.0:5000
```

### 4. Test the Server

Open a new terminal and test the health endpoint:

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{"status": "healthy"}
```

---

## Authentication Testing

### Test 1: Access Protected Endpoint Without Token

```bash
curl http://localhost:5000/api/analytics/overview
```

Expected response: `401 Unauthorized`

### Test 2: Access Protected Endpoint With Invalid Token

```bash
curl -H "Authorization: Bearer invalid-token" http://localhost:5000/api/analytics/overview
```

Expected response: `401 Unauthorized`

### Test 3: Access Protected Endpoint With Valid Token (User Role)

```bash
curl -H "Authorization: Bearer test-user:local-user" http://localhost:5000/api/analytics/overview
```

Expected response: `200 OK` with JSON data

### Test 4: Access Protected Endpoint With Valid Token (Admin Role)

```bash
curl -H "Authorization: Bearer test-admin:local-admin" http://localhost:5000/api/analytics/overview
```

Expected response: `200 OK` with JSON data

---

## RBAC Testing

### Test 1: User Role Cannot Acknowledge Alerts

```bash
curl -X POST \
  -H "Authorization: Bearer test-user:local-user" \
  http://localhost:5000/api/analytics/acknowledge-alert/1
```

Expected response: `403 Forbidden` with error message "Insufficient permissions"

### Test 2: Analyst Role Can Acknowledge Alerts

```bash
# First, create some test data by analyzing an email
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"email_text": "Test email from sender@example.com with urgent request"}' \
  http://localhost:5000/analyze

# Then try to acknowledge an alert (if any exist)
curl -X POST \
  -H "Authorization: Bearer test-analyst:local-analyst" \
  http://localhost:5000/api/analytics/acknowledge-alert/1
```

Expected response: `200 OK` or `404 Not Found` (if no alert exists)

### Test 3: Analyst Role Cannot Trigger Anomaly Detection

```bash
curl -X POST \
  -H "Authorization: Bearer test-analyst:local-analyst" \
  http://localhost:5000/api/analytics/run-anomaly-detection
```

Expected response: `403 Forbidden` with error message "Insufficient permissions"

### Test 4: Admin Role Can Trigger Anomaly Detection

```bash
curl -X POST \
  -H "Authorization: Bearer test-admin:local-admin" \
  http://localhost:5000/api/analytics/run-anomaly-detection
```

Expected response: `200 OK` with message about anomaly detection completion

---

## Rate Limiting Testing

### Test 1: Normal Request (Within Limits)

```bash
curl -H "Authorization: Bearer test-user:local-user" http://localhost:5000/api/analytics/overview
```

Expected response: `200 OK`

### Test 2: Exceed Rate Limit

Run this rapidly (you may need a script):

```bash
for i in {1..35}; do
  curl -H "Authorization: Bearer test-user:local-user" http://localhost:5000/api/analytics/overview
done
```

Expected response: After ~30 requests, you should get `429 Too Many Requests`

---

## Dashboard Testing

### Test 1: Access Dashboard Without Authentication

Open browser and navigate to:
```
http://localhost:5000/dashboard
```

Expected: Browser will prompt for authentication token

### Test 2: Access Dashboard With Valid Token

Enter token when prompted: `test-admin:local-admin`

Expected: Dashboard loads with analytics data

### Test 3: Test Auto-Refresh

Wait 5 minutes and observe dashboard auto-refreshes

---

## Email Analysis Testing

### Test 1: Analyze Safe Email

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "email_text": "Hello, this is a normal email from john@company.com asking about the meeting tomorrow."
  }' \
  http://localhost:5000/analyze
```

Expected response: `200 OK` with low risk score

### Test 2: Analyze Suspicious Email

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "email_text": "URGENT: Your account will be suspended. Click here immediately: http://suspicious-site.com/login"
  }' \
  http://localhost:5000/analyze
```

Expected response: `200 OK` with high risk score and phishing indicators

### Test 3: Report Phishing

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "email_text": "Test email",
    "analysis": {
      "sender": "suspicious@phishing.com",
      "subject": "Urgent Action Required",
      "risk_score": 85,
      "risk_level": "HIGH"
    }
  }' \
  http://localhost:5000/report
```

Expected response: `200 OK` with report_id

---

## Audit Log Testing

### Test 1: Check Audit Logs

After performing various operations, check the audit log:

```bash
tail -f backend/security_audit.log
```

You should see entries for:
- Authentication attempts
- Analytics access
- Alert acknowledgments
- Anomaly detection triggers

---

## Security Headers Testing

### Test Security Headers

```bash
curl -I http://localhost:5000/health
```

Expected headers:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; ...
```

---

## Data Retention Testing

### Test 1: Manual Data Cleanup

You can manually trigger data cleanup by modifying the retention period in `.env` to a very short time (e.g., 1 day) and restarting the server, or wait for the scheduled cleanup at 2 AM.

### Test 2: Verify Cleanup

Check the database to verify old records are deleted:

```bash
cd backend
python -c "
from app import app
from models import EmailAnalysis, PhishingReport, AnomalyAlert
with app.app_context():
    print('Email Analyses:', EmailAnalysis.query.count())
    print('Phishing Reports:', PhishingReport.query.count())
    print('Anomaly Alerts:', AnomalyAlert.query.count())
"
```

---

## Database Backup Testing

### Test 1: Manual Backup Trigger

The backup runs automatically at 3 AM. To test manually, you can call the backup function:

```bash
cd backend
python -c "
from app import app, backup_database
with app.app_context():
    backup_database()
"
```

### Test 2: Verify Backup

Check the `backups/` directory:

```bash
ls -la backend/backups/
```

You should see timestamped database files.

---

## Frontend Integration Testing

### Test 1: Outlook Add-in Integration

1. Open the Outlook add-in (taskpane.html)
2. The `/analyze` endpoint does not require authentication (for Outlook add-in compatibility)
3. Test email analysis from the add-in

### Test 2: Dashboard Authentication

1. Navigate to `http://localhost:5000/dashboard`
2. Enter token when prompted: `test-admin:local-admin`
3. Verify dashboard loads correctly
4. Check browser console for any authentication errors

---

## Common Issues and Solutions

### Issue: "Module not found" errors

**Solution**: Ensure all dependencies are installed:
```bash
pip install -r requirements.txt
```

### Issue: "401 Unauthorized" even with valid token

**Solution**: Check that the token format is correct: `token:role`
- Example: `test-admin:local-admin` (not just `test-admin`)

### Issue: CORS errors in browser

**Solution**: Ensure `ALLOWED_ORIGINS` in `.env` includes your frontend URL:
```bash
ALLOWED_ORIGINS=http://localhost:5000,http://127.0.0.1:5000
```

### Issue: Database locked errors

**Solution**: Stop the server and delete the database file to start fresh:
```bash
rm backend/phishing_analyzer.db
python backend/app.py
```

### Issue: Rate limiting too restrictive for testing

**Solution**: Temporarily increase limits in `app.py` or disable rate limiting for testing

---

## Testing Checklist

Use this checklist to verify all security features are working:

- [ ] Server starts without errors
- [ ] Health endpoint returns 200 OK
- [ ] Protected endpoints return 401 without token
- [ ] Protected endpoints return 401 with invalid token
- [ ] Protected endpoints return 200 with valid token
- [ ] RBAC blocks unauthorized role access
- [ ] RBAC allows authorized role access
- [ ] Rate limiting blocks excessive requests
- [ ] Dashboard prompts for authentication
- [ ] Dashboard loads with valid token
- [ ] Email analysis works correctly
- [ ] Phishing reporting works correctly
- [ ] Audit logs are being written
- [ ] Security headers are present
- [ ] Database backups are created
- [ ] Data retention cleanup works

---

## Next Steps After Testing

Once local testing is complete:

1. **Generate Production Keys**
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

2. **Update `.env` for Production**
   - Set `DEBUG=False`
   - Set `SESSION_COOKIE_SECURE=True`
   - Use PostgreSQL or SQLCipher
   - Update `ALLOWED_ORIGINS` to production URLs
   - Replace test tokens with production tokens

3. **Deploy to Production**
   - Follow the deployment checklist in `SECURITY.md`
   - Monitor `security_audit.log` for issues
   - Test all endpoints in production environment

---

## Automated Testing Script

For automated testing, you can create a test script:

```python
# test_security.py
import requests
import json

BASE_URL = "http://localhost:5000"
TOKENS = {
    "admin": "test-admin:local-admin",
    "analyst": "test-analyst:local-analyst",
    "user": "test-user:local-user"
}

def test_health():
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200
    print("✓ Health check passed")

def test_unauthorized_access():
    r = requests.get(f"{BASE_URL}/api/analytics/overview")
    assert r.status_code == 401
    print("✓ Unauthorized access blocked")

def test_authorized_access():
    headers = {"Authorization": f"Bearer {TOKENS['user']}"}
    r = requests.get(f"{BASE_URL}/api/analytics/overview", headers=headers)
    assert r.status_code == 200
    print("✓ Authorized access allowed")

def test_rbac():
    # User cannot acknowledge alerts
    headers = {"Authorization": f"Bearer {TOKENS['user']}"}
    r = requests.post(f"{BASE_URL}/api/analytics/acknowledge-alert/1", headers=headers)
    assert r.status_code == 403
    print("✓ RBAC blocks unauthorized role")

if __name__ == "__main__":
    test_health()
    test_unauthorized_access()
    test_authorized_access()
    test_rbac()
    print("\nAll security tests passed!")
```

Run with:
```bash
python test_security.py
```
