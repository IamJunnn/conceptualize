# Email Invitation Setup Guide

This guide explains how to configure SMTP email sending for team invitations in Conceptualize.

## Overview

When you create a team and invite members, the system will:
1. Generate unique 6-character invite codes for each member
2. Automatically send beautiful HTML emails to each invited member with their code
3. Display the invite codes to you as the team creator

## Step 1: Configure SMTP Settings

You need to set up SMTP credentials in Firebase Functions configuration. We recommend using Gmail with an App Password.

### Option A: Using Gmail (Recommended)

1. **Enable 2-Factor Authentication on your Google Account**
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Generate an App Password**
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer" (or any device)
   - Click "Generate"
   - Copy the 16-character password (remove spaces)

3. **Set Firebase Functions Config**
   ```bash
   firebase functions:config:set smtp.host="smtp.gmail.com" smtp.port="587" smtp.user="your-email@gmail.com" smtp.pass="your-app-password"
   ```

   Replace:
   - `your-email@gmail.com` with your Gmail address
   - `your-app-password` with the 16-character app password

### Option B: Using Other SMTP Providers

For other providers (SendGrid, Mailgun, etc.), use their SMTP settings:

```bash
firebase functions:config:set smtp.host="smtp.provider.com" smtp.port="587" smtp.user="your-username" smtp.pass="your-password"
```

Common SMTP settings:
- **SendGrid**: `smtp.sendgrid.net:587`
- **Mailgun**: `smtp.mailgun.org:587`
- **Amazon SES**: `email-smtp.us-east-1.amazonaws.com:587`

## Step 2: Deploy Firebase Functions

After configuring SMTP, deploy the functions:

```bash
firebase deploy --only functions
```

This will deploy the `sendInviteEmail` function that handles email sending.

## Step 3: Test the Email System

1. Create a new team in Conceptualize
2. Add team members with their email addresses
3. Click "Create Team"
4. The system will:
   - Generate invite codes
   - Send emails to all invited members
   - Show you the codes in a modal

## Email Template

Invited members will receive a beautiful HTML email with:
- Team name and their role
- Large, easy-to-read invite code
- Step-by-step instructions to join
- Direct link to download Conceptualize

## Troubleshooting

### Emails not sending?

1. **Check Firebase Functions logs:**
   ```bash
   firebase functions:log
   ```

2. **Verify SMTP configuration:**
   ```bash
   firebase functions:config:get
   ```

3. **Common issues:**
   - Gmail: Make sure 2FA is enabled and you're using an App Password, not your regular password
   - Firewall: Ensure port 587 is not blocked
   - Authentication: Check that your SMTP credentials are correct

### Testing locally with Firebase Emulator

```bash
# Set environment variables for local testing
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT="587"
export SMTP_USER="your-email@gmail.com"
export SMTP_PASS="your-app-password"

# Run the emulator
firebase emulators:start --only functions
```

## Security Notes

- SMTP credentials are stored securely in Firebase Functions configuration
- Credentials are never exposed to the client-side code
- Only authenticated users can trigger email sending
- Each email is sent individually (not BCC)
- Failed emails don't block the team creation process

## Email Delivery

- Emails are sent from: `Conceptualize Team <your-smtp-email>`
- Subject: `You've been invited to join [Team Name] on Conceptualize`
- Reply-to: Your SMTP email address

## Next Steps

After setup, team invitations will automatically send emails. Members can:
1. Open the email
2. Copy the invite code
3. Download Conceptualize
4. Click "Start as a Team" → "Join Existing Team"
5. Enter the code
