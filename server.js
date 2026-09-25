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
const nodemailer = require('nodemailer');
const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

// --- setup ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

// basic protection against spam/abuse on the contact endpoint
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 submissions per IP per window
  message: { success: false, error: 'Too many submissions. Please try again later.' }
});

// SMTP transporter — works with Gmail (App Password), your hosting SMTP,
// or a provider like Zoho Mail / SendGrid / Brevo.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
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
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      await transporter.sendMail({
        from: `"Nexsaple Website" <${process.env.SMTP_USER}>`,
        to: process.env.CONTACT_EMAIL || 'hello@nexsaple.com',
        replyTo: email,
        subject: `New project inquiry from ${name}`,
        text:
`New inquiry received on the Nexsaple website.

Name: ${name}
Email: ${email}
Phone: ${phone || '-'}
Company: ${company || '-'}
Service: ${service || '-'}
Budget: ${budget || '-'}

Message:
${message}`
      });
    } else {
      console.warn('SMTP_USER / SMTP_PASS not set — submission was saved but no email was sent.');
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
