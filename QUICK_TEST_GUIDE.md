# ⚡ Quick Testing Guide

## 🚀 Getting Started

1. **Start the app:**
   ```bash
   npm run dev
   ```

2. **Open DevTools Console** (F12) - Test helpers will be loaded automatically!

---

## 🎯 Quick Test Commands (Copy & Paste)

### **1️⃣ Test as First User (Admin)**

```javascript
// Start fresh
testHelpers.clearAppData()
// Then refresh page and choose "Start as a Team"
```

After creating workspace:
```javascript
// Check your workspace
await testHelpers.getMyWorkspace()

// See all members
await testHelpers.getWorkspaceMembers()

// Check auth status
await testHelpers.checkAuthStatus()
```

---

### **2️⃣ Test Invitation Flow**

**As Admin - Create Invite:**
1. Go to Settings → Admin Dashboard → Invite Members
2. Enter email and role
3. Check console for invite token
4. Copy the token (it's in the console logs)

**Simulate Invited User:**
```javascript
// Clear data to simulate new user
testHelpers.clearAppData()

// Paste the token from step 3
testHelpers.simulateInvite('YOUR-TOKEN-HERE', 'Test Team', 'member')

// Refresh page - you'll see Invite Accept Screen
```

---

### **3️⃣ Quick Role Testing**

```javascript
// Check current members and roles
await testHelpers.getWorkspaceMembers()

// Results will show in a nice table format:
// ┌─────────┬──────────────┬───────────────────┬──────────┐
// │ (index) │     email    │    displayName    │   role   │
// ├─────────┼──────────────┼───────────────────┼──────────┤
// │    0    │ 'user1@...'  │ 'Admin User'      │ 'admin'  │
// │    1    │ 'user2@...'  │ 'Member User'     │ 'member' │
// └─────────┴──────────────┴───────────────────┴──────────┘
```

---

### **4️⃣ Test Different User Accounts**

**Sign out and test as different user:**
```javascript
// Switch mode
testHelpers.switchMode('local')  // or 'team'
```

---

### **5️⃣ Debugging Helpers**

```javascript
// View pending invitation
testHelpers.viewPendingInvite()

// Clear pending invitation
testHelpers.clearPendingInvite()

// Generate test token
testHelpers.generateTestToken()

// Check authentication
await testHelpers.checkAuthStatus()
```

---

## 📝 Step-by-Step Testing Scenarios

### **Scenario A: Complete Admin Flow**

```javascript
// 1. Start fresh
testHelpers.clearAppData()
```
→ Refresh page
→ Choose "Start as a Team"
→ Sign in with Google (Account 1)
→ Create workspace "My Team"
→ Choose notes folder

```javascript
// 2. Verify admin status
await testHelpers.checkAuthStatus()
await testHelpers.getMyWorkspace()
```
→ Open Settings → Should see "👑 Admin Dashboard"

```javascript
// 3. Invite a member
```
→ Admin Dashboard → "Invite Members"
→ Email: test@example.com, Role: Member
→ Check console for token (e.g., `1234567890-abc123`)

---

### **Scenario B: Invited Member Flow**

```javascript
// 1. Simulate new user
testHelpers.clearAppData()

// 2. Use token from Scenario A
testHelpers.simulateInvite('1234567890-abc123', 'My Team', 'member')
```
→ Refresh page
→ See "You've Been Invited!" screen
→ Click "Sign In to Accept"
→ Sign in with Google (Account 2 - different from admin)
→ Automatically joins workspace

```javascript
// 3. Verify membership
await testHelpers.checkAuthStatus()
await testHelpers.getMyWorkspace()
```
→ Open Settings → Should see "👤 Member" role
→ No Admin Dashboard button

---

### **Scenario C: Test Leader Role**

**As Admin:**
→ Admin Dashboard → Find member → Click edit (pencil icon)
→ Change role to "Leader"

**Sign in as that Leader:**
```javascript
testHelpers.switchMode('team')  // Will refresh
```
→ Sign in with leader's account
→ Open Settings → Should see "⭐ Leader Dashboard"
→ Can only manage Members (not Leaders/Admins)

---

## 🎨 Visual Testing Checklist

### **Onboarding Screen**
- [ ] Purple gradient background
- [ ] Two cards: "Use Locally" and "Start as a Team"
- [ ] Feature tags display correctly
- [ ] Smooth animations

### **Create Workspace Modal**
- [ ] Opens after first sign-in
- [ ] Input field works
- [ ] "Create Workspace" button enables when text is entered
- [ ] Info box shows next steps

### **Invite Accept Screen**
- [ ] Shows workspace name
- [ ] Role badge with correct color (Admin=purple, Leader=yellow, Member=teal)
- [ ] "What you can do" section displays
- [ ] "Sign In to Accept" button works

### **Admin Dashboard**
- [ ] Stats cards show correct counts
- [ ] Member list displays with avatars
- [ ] Role badges color-coded
- [ ] Edit/delete buttons appear for all members except self
- [ ] Invite Members modal opens

### **Leader Dashboard**
- [ ] Info banner explains limitations
- [ ] Can only edit/remove Members
- [ ] No edit buttons for Leaders/Admins
- [ ] Admin role option is disabled in role modal

---

## 🐛 Common Issues & Fixes

### Issue: "User not authorized"
**Solution:**
```javascript
// Check if user exists
await testHelpers.checkAuthStatus()
// Sign out and back in
```

### Issue: Invite screen doesn't show
**Solution:**
```javascript
// Check for pending invite
testHelpers.viewPendingInvite()

// If none, simulate one
testHelpers.simulateInvite('test-token', 'Test Team', 'member')
```

### Issue: Can't see Dashboard button
**Solution:**
1. Check Firebase Console → `users` collection
2. Verify user has `role: "admin"` or `role: "leader"`
3. Sign out and back in

---

## 📊 Firebase Console Checks

After testing, verify in Firebase Console:

1. **Firestore Database:**
   - `workspaces` → Should have your workspace
   - `workspaces/{id}/members` → Should have all members
   - `users` → Should have all users with roles
   - `invitations` → Should have sent invitations

2. **Authentication:**
   - Should see all signed-in users

---

## 🎯 Production Testing (After Build)

```bash
# Build the app
npm run build

# Run the built app
npm run tauri build
```

Then test deep links with actual URLs:
```
conceptualize://invite?token=YOUR-TOKEN
```

---

## ✅ Testing Checklist

- [ ] First user creates workspace (becomes admin)
- [ ] Admin sees Admin Dashboard in settings
- [ ] Admin can invite members with different roles
- [ ] Invite token is generated in console
- [ ] Simulate invite acceptance with test helpers
- [ ] Invited user sees Invite Accept Screen
- [ ] Auto-join workspace after sign-in
- [ ] Member sees correct role badge
- [ ] Leader sees Leader Dashboard (limited)
- [ ] Leader can only manage Members
- [ ] Admin can manage everyone
- [ ] Role changes reflect immediately
- [ ] Member removal works
- [ ] Firebase Console shows correct data

---

**Need Help?** Check the full [TESTING_GUIDE.md](./TESTING_GUIDE.md) for detailed scenarios!
