Phishing Email Analyzer — Outlook Add-in

AXIS IT Security Team · v1.0


What This Does

Employees click a "Check for Phishing" button directly inside Outlook.
A side panel opens and shows:


Risk score and verdict (SAFE / LOW / MEDIUM / HIGH)
Who sent it and whether the domain is trusted
Specific indicators found (urgency words, suspicious URLs, attachments, etc.)
A Report to Security button if the email looks dangerous


Works in Outlook desktop (Windows/Mac), Outlook on the web, and Outlook mobile.


Project Structure

phishing-outlook-addin/
│
├── backend/
│   ├── analyzer.py          ← Phishing detection logic (Python)
│   ├── app.py               ← Flask API server
│   └── requirements.txt     ← pip dependencies
│
└── frontend/
    ├── manifest.xml         ← Registers add-in with Outlook (upload to M365)
    ├── taskpane.html        ← UI panel shown inside Outlook
    ├── taskpane.js          ← Reads email via Office.js, calls Flask API
    ├── taskpane.css         ← Styles for the panel
    ├── commands.html        ← Blank helper page required by manifest schema
    └── assets/
        ├── icon-16.png      ← Must create these 5 icon files
        ├── icon-32.png
        ├── icon-64.png
        ├── icon-80.png
        └── icon-128.png


How the Files Connect

Outlook reads manifest.xml
  └─► opens taskpane.html  (hosted on GitHub Pages / Azure)
        ├─► loads taskpane.css   (styles)
        └─► loads taskpane.js    (all logic)
              ├─► Office.js reads the open email
              │     (From, To, Cc, Subject, Body, Importance, Attachments)
              └─► fetch POST ──► https://YOUR-BACKEND-URL/analyze
                                   └─► app.py calls analyzer.py
                                         └─► JSON result sent back
                                               └─► taskpane.js renders results

Key point: manifest.xml is the only file Outlook reads directly.
It tells Outlook: "load this URL when the button is clicked."
The frontend (HTML/JS/CSS) and backend (Flask/Python) are completely separate servers.


Before You Deploy — Replace These 3 Values

Open manifest.xml and taskpane.js in VS Code.
Use Find & Replace (Ctrl+H) to replace:

PlaceholderReplace withExampleYOUR-ADDIN-GUID-HEREA unique GUID from guidgenerator.coma3f8c2d1-7b4e-4f9a-8c3d-1e2f3a4b5c6dYOUR-FRONTEND-URLYour GitHub Pages domain — no https://, no trailing slashaxis-it.github.io/phishing-addinYOUR-BACKEND-URLYour Flask server domain — no https://, no trailing slashphishing-api.axis.mu


YOUR-FRONTEND-URL appears 11 times in manifest.xml — use Find & Replace, not manual editing.
YOUR-BACKEND-URL appears 2 times in manifest.xml and 1 time in taskpane.js.




Step-by-Step Deployment

Step 1 — Install backend dependencies

bashcd backend/
pip install -r requirements.txt

Step 2 — Run the Flask backend

For local testing:

bashpython app.py
# Starts on http://localhost:5000

For production (must be HTTPS — use Azure App Service, a VPS with certbot, etc.):

bashpip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app

Verify it works:

bashcurl https://YOUR-BACKEND-URL/health
# Expected: {"status": "healthy", "service": "Phishing Email Analyzer API"}


Step 3 — Host the frontend on GitHub Pages


Create a public GitHub repository (e.g. phishing-addin)
Push everything inside the frontend/ folder to the root of the repo:


   manifest.xml
   taskpane.html
   taskpane.js
   taskpane.css
   commands.html
   assets/icon-16.png
   assets/icon-32.png
   assets/icon-64.png
   assets/icon-80.png
   assets/icon-128.png


In GitHub: Settings → Pages → Source: Deploy from branch → main / root → Save
Wait 2–3 minutes. Your URL will be:
https://YOUR-USERNAME.github.io/phishing-addin



Icons: Create simple PNG shield/lock images in 5 sizes (16×16, 32×32, 64×64, 80×80, 128×128).
Free tool: favicon.io — download and resize the same image to each size.




Step 4 — Update the placeholder values

After you have both URLs confirmed:

In manifest.xml — replace all 11 occurrences of YOUR-FRONTEND-URL
and 2 occurrences of YOUR-BACKEND-URL with your real domains.

In taskpane.js — find line 14:

javascriptconst API_BASE = 'https://YOUR-BACKEND-URL';

Replace YOUR-BACKEND-URL with your Flask server domain.

Commit and push the changes to GitHub. Pages will redeploy automatically.


Step 5 — Sideload for testing (your account only)


Go to outlook.office.com and sign in
Open any email
Click ⋯ (More actions) on the message toolbar
Click Get Add-ins
In the Add-Ins window: My add-ins → + Add a custom add-in → Add from file
Upload your updated manifest.xml
Click Install on the warning prompt
Reload the page
Open any email — you should see a Security group in the ribbon with "Check for Phishing"



Step 6 — Deploy to all employees (IT Admin)


Go to admin.microsoft.com
Sign in as Global Admin or Exchange Admin
Navigate to Settings → Integrated Apps → Upload custom apps
Choose Office Add-in as the app type
Click Upload manifest file → select manifest.xml
Click Next
On Assign users, choose:

Entire organization — rolls out to everyone
Specific users/groups — recommended for a pilot first



Click Next → Finish deploy


Propagation takes up to 24 hours but usually appears within 1–2 hours.
Employees receive it automatically — no installation needed on their part.


Testing Checklist

Before rolling out org-wide, test these scenarios:

Test caseExpected resultInternal IT email from @axis.mu or @blc.muSAFE or LOW (score ≤ 15)External email with urgency words + unknown domainMEDIUM or HIGH (score ≥ 30)Email with .exe attachmentHIGH — attachment flaggedEmail asking for password/bank accountScore increases by +30Click Report to Security on a HIGH emailShows Report ID + success messageOpen https://YOUR-BACKEND-URL/health in browser{"status": "healthy"}


Troubleshooting

SymptomMost likely causeFixRibbon button does not appearVersionOverrides block wrongEnsure manifest has a single VersionOverridesV1_0 block (not nested)Panel opens but stays blank / spins foreverBackend not reachableCheck API_BASE in taskpane.js points to your HTTPS Flask URLCORS error in browser DevTools (F12)Backend blocking frontend domainIn app.py: CORS(app, origins=['https://YOUR-FRONTEND-URL'])Manifest upload fails in Admin CenterXML schema errorValidate at aka.ms/officeaddinvalidator"App not trusted" warning on sideloadExpected for custom add-insClick Install anyway — this is normalLegitimate internal email flagged as riskyFrom field has display name onlyEnsure To/Cc fields contain @axis.mu or @blc.mu addressesAdd-in deployed but employees don't see itPropagation delayWait up to 24 hours; ask employees to fully restart Outlookcommands.html 404 errorFile not uploadedEnsure commands.html exists at root of your GitHub Pages repo


API Reference

Your Flask backend exposes 3 endpoints:

POST /analyze

Analyses an email for phishing indicators.

Request body:

json{
  "email_text": "From: ...\nSubject: ...\n\nBody text",
  "attachments": [
    { "name": "invoice.exe", "size": 204800 }
  ]
}

Response:

json{
  "success": true,
  "analysis": {
    "risk_score": 65,
    "risk_level": "HIGH",
    "is_phishing": true,
    "sender": "support@fake-bank.xyz",
    "subject": "URGENT: Verify your account",
    "importance": "High",
    "indicators": [
      { "score": 35, "title": "Untrusted Domain", "explanation": "..." },
      { "score": 20, "title": "Urgency Language",  "explanation": "..." }
    ],
    "attachments": null
  }
}

POST /report

Reports a phishing email to the security team.

Request body:

json{
  "email_text": "...",
  "analysis": { "...analysis object from /analyze..." }
}

Response:

json{
  "success": true,
  "report_id": "a3f8c2d1-7b4e-4f9a-8c3d-1e2f3a4b5c6d",
  "message": "Email reported to security team"
}

GET /health

Returns server status. Use for uptime monitoring.

Response:

json{
  "status": "healthy",
  "service": "Phishing Email Analyzer API"
}


Risk Scoring Reference

Score rangeRisk levelMeaning< 15SAFENo significant indicators15 – 29LOWMinor signals, proceed with caution30 – 49MEDIUMMultiple indicators, review carefully≥ 50HIGHLikely phishing — do not interact

How scoring works

IndicatorScoreNotesTrusted internal domain (@axis.mu, @blc.mu)−25Reduces overall riskDisplay name only, but trusted recipients−10Partial trustUntrusted / external domain+35Missing sender entirely+30IP-based URL (e.g. http://192.168.1.1/login)+30Sensitive info request (password, bank account…)+30Suspicious TLD (.xyz, .tk, .zip…)+25Suspicious attachment extension (.exe, .vbs…)+25Double extension attachment (.pdf.exe)+35Urgency language+20 (or +10 if trusted sender)Generic greeting (Dear Customer…)+15High Importance flag+15 (or +5 if trusted sender)High-pressure subject line+15 (or +5 if trusted sender)


Requirements


Python 3.8+
Microsoft 365 Business account (any plan)
Microsoft 365 Admin access (for org-wide deployment)
GitHub account (free — for hosting frontend)
A server with HTTPS for the Flask backend


pip packages (see backend/requirements.txt):

Flask==3.0.0
Flask-CORS==4.0.0
Werkzeug==3.0.1


AXIS IT Security — Internal Use Only