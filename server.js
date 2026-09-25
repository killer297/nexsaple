// Nexsaple Infotech — backend server
// Serves the website AND handles the contact form on the server side:
//   1. Validates the incoming request
//   2. Saves every submission to a local JSON "database" file (data/submissions.json)
//   3. Emails the inquiry to your inbox using Nodemailer (SMTP)
//
// Run locally:
//   npm install
//   cp .env.example .env      (then fill in your real SMTP details)
//   npm start
//
// Deploy this on any Node-capable host (Render, Railway, a VPS, cPanel Node app, etc.)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

// --- setup ---
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

// basic protection against spam/abuse on the contact endpoint
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 submissions per IP per window
  message: { success: false, error: 'Too many submissions. Please try again later.' }
});

// --- contact form endpoint ---
app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, phone, company, service, budget, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email and message are required.' });
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }

    const submission = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name, email, phone: phone || '', company: company || '',
      service: service || '', budget: budget || '', message,
      receivedAt: new Date().toISOString(),
      ip: req.ip
    };

    // 1) save to server-side "database" file
    const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    existing.push(submission);
    fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));

    // 2) email the inquiry, if SMTP credentials are configured
// 2) send the inquiry using Resend
const resendResponse = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    from: 'Nexsaple Website <noreply@nexsaple.com>',
    to: [process.env.CONTACT_EMAIL || 'nexsaple726@gmail.com'],
    reply_to: email,
    subject: `New project inquiry from ${name}`,
    text: `New inquiry received on the Nexsaple website.

Name: ${name}
Email: ${email}
Phone: ${phone || '-'}
Company: ${company || '-'}
Service: ${service || '-'}
Budget: ${budget || '-'}

Message:
${message}`
  })
});

if (!resendResponse.ok) {
  const resendError = await resendResponse.text();
  console.error('Resend error:', resendError);
  throw new Error('Email could not be sent.');
}

    res.json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// --- simple protected view of stored submissions ---
// Visit /api/submissions?key=YOUR_ADMIN_KEY to see everything received so far.
app.get('/api/submissions', (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  res.json({ success: true, count: existing.length, submissions: existing });
});

app.listen(PORT, () => {
  console.log(`Nexsaple server running on http://localhost:${PORT}`);
});
