/**
 * Script to get OAuth tokens for conceptualize@launchwith.co
 * Run this once to get the tokens, then store them in Firebase Functions config
 */

const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// OAuth2 Configuration - Use the same client ID/secret as your app
const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = process.env.VITE_GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

// Scopes needed for Drive operations
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getTokens() {
  console.log('\n🔐 Getting OAuth tokens for centralized Google Drive account\n');
  console.log('This script will help you get OAuth tokens for conceptualize@launchwith.co');
  console.log('You\'ll need to sign in with that account.\n');

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });

  console.log('1. Open this URL in your browser and sign in as conceptualize@launchwith.co:');
  console.log('\n' + authUrl + '\n');

  console.log('2. After authorizing, you\'ll be redirected to a URL like:');
  console.log('   http://localhost:3000/oauth2callback?code=XXXX&scope=...\n');

  console.log('3. Copy the entire URL and paste it here:');

  const url = await new Promise((resolve) => {
    rl.question('Paste URL here: ', resolve);
  });

  // Extract code from URL
  const urlObj = new URL(url);
  const code = urlObj.searchParams.get('code');

  if (!code) {
    console.error('❌ No authorization code found in URL');
    process.exit(1);
  }

  console.log('\n✅ Got authorization code, exchanging for tokens...');

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    console.log('\n✅ Successfully got tokens!\n');
    console.log('Access Token:', tokens.access_token);
    console.log('Refresh Token:', tokens.refresh_token);
    console.log('Expires In:', tokens.expiry_date ? new Date(tokens.expiry_date).toLocaleString() : 'Unknown');

    // Save to file for reference
    const outputPath = path.join(__dirname, 'central-tokens.json');
    fs.writeFileSync(outputPath, JSON.stringify(tokens, null, 2));
    console.log(`\n📁 Tokens saved to: ${outputPath}`);

    console.log('\n📝 Now set these tokens in Firebase Functions config:');
    console.log('\nRun this command:');
    console.log(`firebase functions:config:set google.central_access_token="${tokens.access_token}" google.central_refresh_token="${tokens.refresh_token}"`);

    console.log('\n✨ Done! Your centralized Drive account is ready.');
  } catch (error) {
    console.error('❌ Failed to get tokens:', error.message);
    process.exit(1);
  }

  rl.close();
}

// Run the script
getTokens().catch(console.error);