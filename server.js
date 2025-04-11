import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 7845;
const DATA_FILE = path.join(__dirname, 'data', 'emails.json');

// Middleware
app.use(cors());
app.use(express.json());

// Ensure data directory and file exist
async function ensureDataFile() {
  const dir = path.join(__dirname, 'data');
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify([]));
  }
}

// Load emails from JSON file
async function loadEmails() {
  await ensureDataFile();
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading emails:', error);
    return [];
  }
}

// Save emails to JSON file
async function saveEmails(emails) {
  await ensureDataFile();
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(emails, null, 2));
  } catch (error) {
    console.error('Error saving emails:', error);
  }
}

// Mock function to send an email
async function sendEmail(email) {
  console.log('📧 SENDING EMAIL:');
  console.log(`To: ${email.recipientEmail}`);
  console.log(`Subject: ${email.subject}`);
  console.log(`Body: ${email.body}`);
  console.log(`Sent at: ${new Date().toISOString()}`);
  console.log('-----------------------------------');

  return { ...email, status: 'sent' };
}

// Schedule an email
app.post('/schedule', async (req, res) => {
  try {
    const { recipientEmail, subject, body, scheduledTime } = req.body;

    if (!recipientEmail || !subject || !body || !scheduledTime) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const scheduledDate = new Date(scheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    if (scheduledDate < new Date()) {
      return res.status(400).json({ message: 'Scheduled time must be in the future' });
    }

    const email = {
      id: uuidv4(),
      recipientEmail,
      subject,
      body,
      scheduledTime: scheduledDate.toISOString(),
      status: 'pending',
    };

    const emails = await loadEmails();
    emails.push(email);
    await saveEmails(emails);

    res.status(201).json({ message: 'Email scheduled successfully', email });
  } catch (error) {
    console.error('Error scheduling email:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all scheduled emails
app.get('/scheduled', async (req, res) => {
  try {
    const emails = await loadEmails();
    res.json(emails);
  } catch (error) {
    console.error('Error fetching scheduled emails:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Check for emails that need to be sent
async function checkScheduledEmails() {
  try {
    const emails = await loadEmails();
    const now = new Date();
    let updated = false;

    for (let i = 0; i < emails.length; i++) {
      if (emails[i].status === 'pending') {
        const scheduledTime = new Date(emails[i].scheduledTime);

        if (scheduledTime <= now) {
          emails[i] = await sendEmail(emails[i]);
          updated = true;
        }
      }
    }

    if (updated) {
      await saveEmails(emails);
    }
  } catch (error) {
    console.error('Error checking scheduled emails:', error);
  }
}

// Initialize the scheduler
function initializeScheduler() {
  cron.schedule('* * * * *', async () => {
    await checkScheduledEmails();
  });

  console.log('✅ Email scheduler initialized');
}

// Start the server
app.listen(PORT, async () => {
  await ensureDataFile();
  initializeScheduler();
  console.log(`🚀 Server running on port ${PORT}`);
});
