# Outlook Add-in Implementation Guide

## Current Implementation Overview

The Phishing Analyzer integrates with Microsoft Outlook as an Office Add-in using the Office.js API. The add-in allows users to analyze emails directly within Outlook for phishing indicators.

## Architecture

```
Outlook Desktop/Web
    ↓
Office.js API (extracts email data)
    ↓
taskpane.js (frontend logic)
    ↓
Backend API (/analyze endpoint)
    ↓
SimplePhishingAnalyzer (analysis logic)
    ↓
Results displayed in task pane
```

## Components

### 1. Manifest (`manifest.xml`)

The manifest defines how the add-in appears in Outlook:

- **ID**: Unique identifier for the add-in
- **Permissions**: `ReadItem` - allows reading email content
- **AppDomains**: Whitelisted domains (frontend and backend URLs)
- **FormSettings**: Defines the task pane URL
- **VersionOverrides**: Adds a ribbon button "Check for Phishing"

**Key Configuration:**
```xml
<AppDomains>
  <AppDomain>https://gilded-trifle-133800.netlify.app</AppDomain>
  <AppDomain>https://phishing-axis.onrender.com</AppDomain>
</AppDomains>

<SourceLocation DefaultValue="https://gilded-trifle-133800.netlify.app/taskpane.html"/>
```

### 2. Task Pane (`taskpane.html`)

The UI that appears when the add-in is activated:

- Loading spinner
- Analysis results display
- Risk score and level
- Email details (sender, subject, importance)
- Phishing indicators list
- Attachment analysis
- Report to security button

**Security Features:**
- Content Security Policy (CSP) header
- HTML escaping for user inputs
- No inline scripts (except Office.js)

### 3. JavaScript Logic (`taskpane.js`)

Handles the interaction between Outlook and the backend:

**Office.js Integration:**
```javascript
Office.onReady((info) => {
    if (info.host === Office.HostType.Outlook) {
        analyzeBtn.addEventListener('click', analyzeEmail);
    }
});
```

**Email Extraction:**
```javascript
async function analyzeEmail() {
    const item = Office.context.mailbox.item;
    
    // Extract email data
    const fromDisplay = item.from ? (item.from.displayName || '') : '';
    const fromEmail = item.from ? (item.from.emailAddress || '') : '';
    const subject = item.subject || '';
    const body = await getItemBody(item);
    const attachments = getAttachments(item);
    
    // Send to backend
    const result = await postToBackend(API_ENDPOINT, { 
        email_text: emailText, 
        attachments 
    });
}
```

**API Communication:**
```javascript
async function postToBackend(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return response.json();
}
```

## Current Security Considerations

### Issue: Unauthenticated `/analyze` Endpoint

The `/analyze` endpoint currently does NOT require authentication to allow the Outlook add-in to work. This is intentional but creates a security risk:

**Current State:**
```python
@app.route("/analyze", methods=["POST"])
@limiter.limit("30 per minute")  # Rate limited but NOT authenticated
def analyze_email():
    # ... analysis logic
```

**Security Risk:**
- Anyone can call the `/analyze` endpoint
- Potential for abuse by attackers
- No audit trail of who is analyzing emails

## Recommended Security Improvements

### Option 1: Add-in Specific API Key (Recommended)

Create a dedicated API key for the Outlook add-in:

**Backend Changes:**
```python
# Add to app.py
ADDIN_API_KEY = os.environ.get('ADDIN_API_KEY', '')

@app.route("/analyze", methods=["POST"])
@limiter.limit("30 per minute")
def analyze_email():
    # Check for add-in API key
    addin_key = request.headers.get('X-Addin-API-Key')
    if addin_key != ADDIN_API_KEY:
        audit_logger.warning("Invalid add-in API key attempt")
        return jsonify({
            "success": False,
            "error": "Unauthorized"
        }), 401
    
    # ... rest of analysis logic
```

**Frontend Changes:**
```javascript
// In taskpane.js
async function postToBackend(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-Addin-API-Key': 'your-addin-api-key-here'  // Add this
        },
        body: JSON.stringify(payload)
    });
    return response.json();
}
```

**Environment Variable:**
```bash
# In .env
ADDIN_API_KEY=<generate-secure-key>
```

**Pros:**
- Simple to implement
- Maintains security
- Easy to rotate keys
- Audit trail via logs

**Cons:**
- API key embedded in frontend (can be extracted)
- Need to secure the key in production

### Option 2: Microsoft Graph API Authentication

Use Microsoft's authentication system:

**Implementation:**
1. Register app in Azure AD
2. Use OAuth 2.0 flow
3. Add-in authenticates with Microsoft identity
4. Backend validates Microsoft tokens

**Pros:**
- Industry standard
- No API keys to manage
- Integrated with Microsoft ecosystem
- User-based authentication

**Cons:**
- More complex to implement
- Requires Azure AD setup
- Users need to sign in

### Option 3: Hybrid Approach (Best for Production)

Combine both approaches:

1. **Add-in API Key** for basic validation
2. **Optional Microsoft Graph** for enhanced features
3. **Rate limiting** to prevent abuse
4. **IP whitelisting** for known Outlook clients

## Deployment Steps

### 1. Update Manifest URLs

Update `manifest.xml` with your production URLs:

```xml
<AppDomains>
  <AppDomain>https://your-frontend-domain.com</AppDomain>
  <AppDomain>https://your-backend-domain.com</AppDomain>
</AppDomains>

<SourceLocation DefaultValue="https://your-frontend-domain.com/taskpane.html"/>
```

### 2. Deploy Frontend

Deploy the frontend files to your hosting:
- `taskpane.html`
- `taskpane.js`
- `taskpane.css`
- `commands.html`
- `assets/` (icons)

### 3. Deploy Backend

Deploy the Flask backend with:
- Updated environment variables
- Production database (PostgreSQL recommended)
- SSL/TLS enabled
- Add-in API key configured

### 4. Register Add-in in Microsoft

**Option A: Sideloading (Development)**
1. Open Outlook on the web
2. Go to Settings → Add-ins → My Add-ins
3. Click "Custom add-ins" → "Add a custom add-in"
4. Select "Add from file" and upload `manifest.xml`

**Option B: AppSource (Production)**
1. Create Microsoft Developer account
2. Submit add-in for validation
3. Publish to AppSource

### 5. Test in Outlook

1. Open Outlook
2. Click "Check for Phishing" button in ribbon
3. Task pane should open
4. Click "Analyze Email"
5. Verify analysis results appear

## Testing the Add-in

### Local Testing with Office.js

Use the Office.js testing tools:

1. **Office Add-in Debugger**
   - Install in VS Code
   - Set breakpoints in `taskpane.js`
   - Debug in browser or Outlook

2. **Test in Browser**
   - Open `taskpane.html` in browser
   - Will use sample email (test mode)
   - Test UI without Outlook

3. **Test in Outlook Desktop**
   - Sideload the manifest
   - Test with real emails
   - Verify all features work

### Test Scenarios

**Scenario 1: Safe Email**
- Open a legitimate email
- Click "Check for Phishing"
- Verify low risk score
- Verify no phishing indicators

**Scenario 2: Phishing Email**
- Open a suspicious email
- Click "Check for Phishing"
- Verify high risk score
- Verify phishing indicators displayed
- Test "Report to Security" button

**Scenario 3: Email with Attachments**
- Open email with attachments
- Click "Check for Phishing"
- Verify attachment analysis
- Verify suspicious file detection

**Scenario 4: Network Error**
- Disconnect internet
- Try to analyze email
- Verify error message displayed
- Verify graceful handling

## Security Best Practices for Add-in

### 1. Content Security Policy

Already implemented in `taskpane.html`:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://appsforoffice.microsoft.com;
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://your-backend.com;
  img-src 'self' data:;
  frame-ancestors 'none'
">
```

### 2. Input Sanitization

Already implemented in `taskpane.js`:
```javascript
function escHtml(str) {
    return String(str || '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;');
}
```

### 3. HTTPS Only

- Frontend must use HTTPS
- Backend must use HTTPS
- Manifest URLs must be HTTPS

### 4. Domain Whitelisting

Only allow connections to trusted domains:
```xml
<AppDomains>
  <AppDomain>https://your-frontend.com</AppDomain>
  <AppDomain>https://your-backend.com</AppDomain>
</AppDomains>
```

### 5. Minimal Permissions

Use only necessary permissions:
```xml
<Permissions>ReadItem</Permissions>
```

## Troubleshooting

### Issue: Add-in doesn't appear in Outlook

**Solutions:**
1. Verify manifest is valid XML
2. Check all URLs are accessible
3. Ensure HTTPS is used
4. Clear Outlook cache
5. Try sideloading again

### Issue: "Cannot reach backend server" error

**Solutions:**
1. Check backend is running
2. Verify CORS configuration
3. Check firewall settings
4. Verify API endpoint URL
5. Check browser console for errors

### Issue: Analysis returns error

**Solutions:**
1. Check backend logs
2. Verify email data is being extracted
3. Check API key (if implemented)
4. Verify rate limiting not blocking
5. Check database connection

### Issue: Add-in loads slowly

**Solutions:**
1. Optimize frontend assets
2. Use CDN for static files
3. Enable compression
4. Minimize API calls
5. Implement caching

## Monitoring and Maintenance

### 1. Monitor Usage

Track metrics:
- Number of analyses per day
- Average response time
- Error rates
- User feedback

### 2. Monitor Security

Review logs for:
- Invalid API key attempts
- Unusual usage patterns
- Rate limit violations
- Failed authentication

### 3. Regular Updates

- Update phishing detection rules
- Rotate API keys quarterly
- Update dependencies
- Review security logs monthly

### 4. User Feedback

- Collect user feedback
- Monitor false positives/negatives
- Adjust detection thresholds
- Improve UI based on usage

## Next Steps

1. **Implement Add-in API Key** (Option 1 above)
2. **Update frontend with API key**
3. **Test authentication flow**
4. **Deploy to production**
5. **Monitor usage and security**
6. **Gather user feedback**
7. **Iterate on improvements**

## Additional Resources

- [Office.js Documentation](https://docs.microsoft.com/en-us/office/dev/add-ins/overview/office-js-overview)
- [Outlook Add-in Manifest](https://docs.microsoft.com/en-us/office/dev/add-ins/xml/manifest)
- [Office Add-in Testing](https://docs.microsoft.com/en-us/office/dev/add-ins/testing/test-debug-office-add-ins)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
