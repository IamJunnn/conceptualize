# 🧪 Testing Guide - Team Collaboration Features

This guide will help you test all the features we just built, step by step.

---

## 📋 Prerequisites

Before testing, make sure:

1. **Firebase is set up** ✅ (Already configured in your project)
2. **App is running:** `npm run dev`
3. **You have 2 email accounts** for testing (one for Admin, one for Member)
4. **Google OAuth credentials** are configured (already done in your `.env` file)

---

## 🎯 Test Scenarios

### **Scenario 1: First User Creates Workspace (Admin Flow)**

This tests: Onboarding → Sign Up → Workspace Creation

#### Steps:

1. **Start fresh:**
   ```bash
   # Clear localStorage to simulate first-time user
   # In browser DevTools Console:
   localStorage.clear()
   # Then refresh the app
   ```

2. **Launch the app:**
   - You should see the **Mode Selection Screen** (purple gradient background)
   - Two options: "Use Locally" and "Start as a Team"

3. **Choose "Start as a Team":**
   - Click the "Start as a Team" button

4. **Sign in:**
   - You'll see the **Login Screen**
   - Click "Sign in with Google"
   - Choose your first email account (this will be the admin)

5. **Create Workspace:**
   - After successful login, you should see the **Create Workspace Modal**
   - Enter a workspace name (e.g., "Test Team")
   - Click "Create Workspace"

6. **Setup folder:**
   - Choose a notes folder when prompted
   - The app should load with your workspace created

7. **Verify Admin status:**
   - Click the **Settings** button (gear icon)
   - Go to "General" tab
   - You should see **"👑 Admin Dashboard"** button
   - Click "Open Dashboard"

8. **Check Admin Dashboard:**
   - Should show:
     - Total Members: 1
     - Admins: 1
     - "Invite Members" button
     - Your user listed with "Admin" badge and "You" tag

✅ **Success:** Workspace created, you are admin!

---

### **Scenario 2: Admin Invites a Member**

This tests: Invite System → Email Generation → Invite Link

#### Steps:

1. **Open Admin Dashboard:**
   - Settings → "👑 Admin Dashboard" → "Open Dashboard"

2. **Click "Invite Members":**
   - Should open the **Invite Members Modal**

3. **Enter member details:**
   - Email: Your second test email (e.g., `test2@gmail.com`)
   - Role: Select "Member" (or try "Leader" or "Admin")
   - Click "Send Invitation"

4. **Check the console:**
   - Open DevTools (F12)
   - Look for the invitation details in the console:
   ```
   ====================================================
   📧 INVITATION EMAIL
   ====================================================
   To: test2@gmail.com
   From: Your Name
   Workspace: Test Team
   Role: member
   Invite Link: conceptualize://invite?token=xxxxx
   ====================================================
   ✓ Invite link copied to clipboard!
   ✓ Invitation email sent (simulated)
   ```

5. **Copy the invite link:**
   - The link should be copied to your clipboard automatically
   - Or copy it from the console
   - Format: `conceptualize://invite?token=1234567890-abcdef`

6. **Save the token:**
   - Keep this token for the next test!

✅ **Success:** Invitation created with token!

---

### **Scenario 3: Invited User Accepts Invitation (Deep Link Flow)**

This tests: Deep Links → Invite Accept → Auto-Join Workspace

#### Steps:

1. **Simulate invited user:**
   ```bash
   # Clear localStorage to simulate a new user
   localStorage.clear()
   # Refresh the app
   ```

2. **Manually trigger deep link:**
   Since we're in development, we'll simulate the deep link manually:

   **Option A - Using the invite token:**
   - In DevTools Console, paste:
   ```javascript
   localStorage.setItem('pendingInvitation', JSON.stringify({
     token: 'YOUR_TOKEN_HERE', // Replace with actual token from Step 2
     workspaceId: 'workspace-id',
     workspaceName: 'Test Team',
     role: 'member'
   }))
   // Refresh the page
   location.reload()
   ```

   **Option B - For production testing (when app is built):**
   - Open the invite link directly: `conceptualize://invite?token=YOUR_TOKEN`
   - This will launch the app with the invitation

3. **See Invite Accept Screen:**
   - Should show:
     - Workspace name: "Test Team"
     - Role badge with color (e.g., "Member" in teal)
     - "What you can do" section
     - "Sign In to Accept" button

4. **Sign in:**
   - Click "Sign In to Accept"
   - Authenticate with your **second email** (different from admin)

5. **Automatic acceptance:**
   - After login, the invitation should be **automatically accepted**
   - You should be added to the workspace
   - The app should load normally

6. **Verify membership:**
   - Go to Settings → Account tab
   - Should show your role (e.g., "👤 Member")
   - No Admin Dashboard button (only admins see this)

7. **Verify from Admin side:**
   - Sign out and sign back in with your **first email** (admin)
   - Open Admin Dashboard
   - Should now show **2 members**:
     - You (Admin)
     - Second user (Member)

✅ **Success:** Invitation accepted, member joined workspace!

---

### **Scenario 4: Admin Manages Roles**

This tests: Role Management → Change Roles → Remove Members

#### Steps:

1. **Sign in as Admin:**
   - Use your first email (admin account)

2. **Open Admin Dashboard:**
   - Settings → "👑 Admin Dashboard"

3. **Change a member's role:**
   - Click the **edit button** (pencil icon) next to the member
   - Select a new role (e.g., Member → Leader)
   - Should update immediately

4. **Verify role change:**
   - The role badge should update
   - Stats should reflect new counts

5. **Remove a member:**
   - Click the **trash icon** next to a member
   - Confirm the removal
   - Member should be removed from the list

6. **Invite another admin:**
   - Click "Invite Members"
   - Choose "Admin" role
   - Send invitation
   - (You can test with a third email or just verify the invite was created)

✅ **Success:** Role management works!

---

### **Scenario 5: Leader Dashboard (Limited Permissions)**

This tests: Leader Role → Limited Management

#### Steps:

1. **Create a Leader:**
   - As admin, invite someone with "Leader" role
   - Or promote an existing member to Leader

2. **Sign in as Leader:**
   - Sign out
   - Sign in with the leader's email

3. **Open Leader Dashboard:**
   - Settings → General tab
   - Should see **"⭐ Leader Dashboard"** button
   - Click "Open Dashboard"

4. **Verify limited permissions:**
   - Can see all members
   - Can only edit Members (not other Leaders or Admins)
   - Edit/trash buttons should only appear next to Members
   - Info banner: "As a Leader, you can manage Members..."

5. **Try to promote to Admin:**
   - Click edit on a Member
   - Try to select "Admin" role
   - Should be disabled with message "Requires Admin permission"

6. **Remove a member:**
   - Should work (Leaders can remove members)

✅ **Success:** Leader permissions enforced!

---

## 🔍 Database Verification (Firebase Console)

To verify data is being stored correctly:

1. **Go to Firebase Console:**
   - https://console.firebase.google.com/
   - Select project: `conceptualize-c9a41`

2. **Check Firestore collections:**

   **`workspaces` collection:**
   ```
   - id: auto-generated
   - name: "Test Team"
   - createdBy: user-uid
   - memberCount: 2
   ```

   **`workspaces/{workspaceId}/members` subcollection:**
   ```
   - uid: user-id
   - email: user@example.com
   - displayName: "User Name"
   - role: "admin" | "leader" | "member"
   - joinedAt: timestamp
   ```

   **`invitations` collection:**
   ```
   - workspaceId: workspace-id
   - email: invitee@example.com
   - role: "member"
   - token: unique-token
   - status: "pending" | "accepted"
   ```

   **`users` collection:**
   ```
   - uid: user-id
   - email: user@example.com
   - workspaceId: workspace-id
   - role: "admin" | "leader" | "member"
   ```

---

## 🐛 Troubleshooting

### **Issue: "User not authorized" error**

**Cause:** User doesn't exist in Firestore

**Fix:**
- The workspace creation flow should create the user automatically
- If not, manually add user to `users` collection in Firebase Console

---

### **Issue: Invitation not found**

**Cause:** Token expired or invalid

**Fix:**
- Generate a new invitation
- Make sure you're using the correct token

---

### **Issue: Can't see Admin/Leader Dashboard button**

**Cause:** User role not set correctly

**Fix:**
1. Check Firebase Console → `users` collection → your user document
2. Verify `role` field is set to "admin" or "leader"
3. Sign out and back in

---

### **Issue: Deep link not working**

**Cause:** App not registered for deep link protocol (only works in production build)

**Workaround for development:**
- Use the manual localStorage method shown in Scenario 3

**For production:**
```bash
# Build the app
npm run build

# The built app will handle deep links automatically
```

---

## 📊 Testing Checklist

Use this to track your testing progress:

- [ ] **Scenario 1:** First user creates workspace (Admin)
- [ ] **Scenario 2:** Admin invites a member
- [ ] **Scenario 3:** Invited user accepts via invite link
- [ ] **Scenario 4:** Admin changes roles and removes members
- [ ] **Scenario 5:** Leader has limited permissions
- [ ] **Verification:** All data appears correctly in Firebase Console
- [ ] **Edge cases:** Try invalid tokens, duplicate invites, etc.

---

## 🎉 Next Steps After Testing

Once everything works:

1. **Integrate Real Email Service:**
   - Update `src/services/emailService.ts`
   - Add SendGrid, AWS SES, or Firebase Email Extension
   - Replace the console.log with actual email sending

2. **Add Payment Integration:**
   - Integrate Stripe for $5/person subscription
   - Add payment gate before workspace creation/joining

3. **Deploy:**
   - Build the app: `npm run build`
   - Test deep links in production
   - Distribute to beta testers!

---

**Happy Testing! 🚀**

If you encounter any issues, check the console for errors and refer to the Troubleshooting section above.
