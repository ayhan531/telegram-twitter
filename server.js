import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health Check for Render
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'OmniSync Social Media Platform',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Telegram Webhook Endpoint simulator for Render deployment
app.post('/api/webhook/telegram', (req, res) => {
  console.log('Received Telegram Webhook Payload:', req.body);
  res.json({
    success: true,
    message: 'Telegram webhook received and processed successfully',
    payload: req.body
  });
});

// WhatsApp Webhook Endpoint simulator
app.post('/api/webhook/whatsapp', (req, res) => {
  console.log('Received WhatsApp Webhook Payload:', req.body);
  res.json({
    success: true,
    message: 'WhatsApp webhook received and processed successfully',
    payload: req.body
  });
});

// Serve static assets from Vite build dist folder
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 OmniSync Social Web App running on port ${PORT}`);
  console.log(`📱 Ready for Render Deployment & Mobile Access`);
});
