use lettre::message::{header::ContentType, Message, Mailbox};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{SmtpTransport, Transport};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct InvitationEmail {
    pub email: String,
    pub workspace_name: String,
    pub invited_by_name: String,
    pub role: String,
    pub token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TeamInvitationEmail {
    pub email: String,
    pub team_name: String,
    pub invite_code: String,
    pub role: String,
}

/// Send invitation email via Gmail SMTP
#[tauri::command]
pub async fn send_invitation_email(invitation: InvitationEmail) -> Result<String, String> {
    // Gmail SMTP credentials
    let smtp_username = "junson@launchwith.co";
    let smtp_password = "erhk oflj cdgz kfqw";

    // Generate invite link - using HTTPS URL that can redirect to the app
    // You should replace this with your actual domain
    let invite_link = format!("https://conceptualize.app/invite?token={}", invitation.token);

    // Build email message
    let email = Message::builder()
        .from(
            "Conceptualize <junson@launchwith.co>"
                .parse::<Mailbox>()
                .map_err(|e| format!("Failed to parse from address: {}", e))?,
        )
        .to(invitation
            .email
            .parse::<Mailbox>()
            .map_err(|e| format!("Failed to parse to address: {}", e))?)
        .subject(format!(
            "You're invited to join {} on Conceptualize",
            invitation.workspace_name
        ))
        .header(ContentType::TEXT_HTML)
        .body(build_email_html(&invitation, &invite_link))
        .map_err(|e| format!("Failed to build email: {}", e))?;

    // Create SMTP transport
    let creds = Credentials::new(smtp_username.to_string(), smtp_password.to_string());

    let mailer = SmtpTransport::starttls_relay("smtp.gmail.com")
        .map_err(|e| format!("Failed to create SMTP transport: {}", e))?
        .credentials(creds)
        .port(587)
        .build();

    // Send the email
    mailer
        .send(&email)
        .map_err(|e| format!("Failed to send email: {}", e))?;

    Ok(format!("Invitation email sent to {}", invitation.email))
}

fn build_email_html(invitation: &InvitationEmail, invite_link: &str) -> String {
    let role_permissions = match invitation.role.as_str() {
        "admin" => r#"
            <li>Full workspace control</li>
            <li>Invite and manage team members</li>
            <li>Assign roles and permissions</li>
        "#,
        "leader" => r#"
            <li>Manage team members</li>
            <li>Access all team features</li>
            <li>Collaborate on shared notes</li>
        "#,
        _ => r#"
            <li>Create and edit notes</li>
            <li>Collaborate in real-time</li>
            <li>Access shared knowledge base</li>
        "#,
    };

    format!(
        r#"<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <!--[if mso]>
            <noscript>
                <xml>
                    <o:OfficeDocumentSettings>
                        <o:PixelsPerInch>96</o:PixelsPerInch>
                    </o:OfficeDocumentSettings>
                </xml>
            </noscript>
            <![endif]-->
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f5f5;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
                <tr>
                    <td align="center" style="padding: 40px 10px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #c44fc4 0%, #8b5fbf 50%, #64c8ca 100%); padding: 40px 20px; text-align: center;">
                                    <h1 style="color: white; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Conceptualize</h1>
                                    <p style="color: white; opacity: 0.9; margin: 8px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Collaborative Knowledge Management</p>
                                </td>
                            </tr>

                            <!-- Body -->
                            <tr>
                                <td style="padding: 40px 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                    <h2 style="color: #1a202c; margin-top: 0; font-size: 28px;">You've been invited!</h2>

                                    <p style="color: #4a5568; line-height: 1.6; font-size: 16px;">
                                        <strong style="color: #2d3748;">{}</strong> has invited you to join
                                        <strong style="color: #2d3748;">{}</strong> as a <strong style="color: #2d3748;">{}</strong>.
                                    </p>

                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
                                        <tr>
                                            <td style="background: #f7fafc; padding: 20px; border-radius: 8px;">
                                                <h3 style="color: #1a202c; margin-top: 0; font-size: 16px;">What you can do:</h3>
                                                <ul style="color: #4a5568; line-height: 1.8; margin: 0; padding-left: 20px;">
                                                    {}
                                                </ul>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Button -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 32px auto;">
                                        <tr>
                                            <td style="border-radius: 8px; background: linear-gradient(135deg, #c44fc4 0%, #8b5fbf 100%);">
                                                <a href="{}" target="_blank" style="background: linear-gradient(135deg, #c44fc4 0%, #8b5fbf 100%); border: none; border-radius: 8px; color: white; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 600; line-height: 50px; text-align: center; text-decoration: none; width: 200px; -webkit-text-size-adjust: none; mso-hide: all;">Accept Invitation</a>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Alternative link for email clients that don't support buttons -->
                                    <p style="color: #718096; font-size: 14px; text-align: center; margin: 16px 0;">
                                        Or copy and paste this link in your browser:<br>
                                        <a href="{}" style="color: #c44fc4; text-decoration: underline; word-break: break-all;">{}</a>
                                    </p>

                                    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
                                        <h4 style="color: #1a202c; margin-top: 0; font-size: 14px;">Next steps:</h4>
                                        <ol style="color: #718096; font-size: 13px; line-height: 1.8; margin: 0; padding-left: 20px;">
                                            <li>Click the button above or use the link provided</li>
                                            <li>Download and install Conceptualize (if you haven't already)</li>
                                            <li>Sign in with your Google account or email</li>
                                            <li>Start collaborating with your team!</li>
                                        </ol>
                                    </div>

                                    <p style="color: #a0aec0; font-size: 12px; margin-top: 32px; text-align: center;">
                                        This invitation was sent by {}.<br>
                                        If you didn't expect this invitation, you can safely ignore this email.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>"#,
        invitation.invited_by_name,
        invitation.workspace_name,
        invitation.role,
        role_permissions,
        invite_link,
        invite_link,
        invite_link,
        invitation.invited_by_name
    )
}

/// Send team invitation email via Gmail SMTP
#[tauri::command]
pub async fn send_team_invitation_email(invitation: TeamInvitationEmail) -> Result<String, String> {
    // Gmail SMTP credentials
    let smtp_username = "junson@launchwith.co";
    let smtp_password = "erhk oflj cdgz kfqw";

    // Build email message
    let email = Message::builder()
        .from(
            "Conceptualize Team <junson@launchwith.co>"
                .parse::<Mailbox>()
                .map_err(|e| format!("Failed to parse from address: {}", e))?,
        )
        .to(invitation
            .email
            .parse::<Mailbox>()
            .map_err(|e| format!("Failed to parse to address: {}", e))?)
        .subject(format!(
            "You're invited to join {} on Conceptualize",
            invitation.team_name
        ))
        .header(ContentType::TEXT_HTML)
        .body(build_team_email_html(&invitation))
        .map_err(|e| format!("Failed to build email: {}", e))?;

    // Create SMTP transport
    let creds = Credentials::new(smtp_username.to_string(), smtp_password.to_string());

    let mailer = SmtpTransport::starttls_relay("smtp.gmail.com")
        .map_err(|e| format!("Failed to create SMTP transport: {}", e))?
        .credentials(creds)
        .port(587)
        .build();

    // Send the email
    mailer
        .send(&email)
        .map_err(|e| format!("Failed to send email: {}", e))?;

    Ok(format!("Team invitation email sent to {}", invitation.email))
}

fn build_team_email_html(invitation: &TeamInvitationEmail) -> String {
    format!(
        r#"<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
                <tr>
                    <td align="center" style="padding: 40px 10px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #c44fc4 0%, #8b5fbf 50%, #64c8ca 100%); padding: 40px 20px; text-align: center;">
                                    <h1 style="color: white; margin: 0; font-size: 32px;">Conceptualize</h1>
                                    <p style="color: white; opacity: 0.9; margin: 8px 0 0 0;">Team Collaboration</p>
                                </td>
                            </tr>

                            <!-- Body -->
                            <tr>
                                <td style="padding: 40px 30px;">
                                    <h2 style="color: #1a202c; margin-top: 0; font-size: 24px;">You're invited to join {}</h2>

                                    <p style="color: #4a5568; line-height: 1.6; font-size: 16px; margin-top: 20px;">
                                        Follow these simple steps to get started:
                                    </p>

                                    <ol style="color: #2d3748; line-height: 2; font-size: 15px; margin: 24px 0; padding-left: 20px;">
                                        <li>Go to <a href="https://conceptualize-note.vercel.app" style="color: #c44fc4; text-decoration: none; font-weight: 600;">https://conceptualize-note.vercel.app</a></li>
                                        <li>Download Conceptualize for your platform</li>
                                        <li>Install the application</li>
                                        <li>Run Conceptualize</li>
                                        <li>Click <strong>"Start as a Team"</strong> button</li>
                                        <li>Click <strong>"Join Existing Team"</strong></li>
                                        <li>Enter your invite code: <strong style="color: #c44fc4; font-size: 18px;">{}</strong></li>
                                    </ol>

                                    <!-- Invite Code Highlight -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
                                        <tr>
                                            <td style="background: linear-gradient(135deg, rgba(196, 79, 196, 0.1) 0%, rgba(100, 200, 202, 0.1) 100%); padding: 24px; border-radius: 8px; border: 2px dashed #c44fc4; text-align: center;">
                                                <p style="color: #718096; margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Invite Code</p>
                                                <p style="color: #c44fc4; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 2px; font-family: 'Courier New', monospace;">{}</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color: #718096; font-size: 14px; line-height: 1.6; margin-top: 32px;">
                                        If you have any questions, feel free to reach out to your team admin.
                                    </p>

                                    <p style="color: #a0aec0; font-size: 12px; margin-top: 32px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 24px;">
                                        <strong>Conceptualize Team</strong><br>
                                        If you didn't expect this invitation, you can safely ignore this email.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>"#,
        invitation.team_name,
        invitation.invite_code,
        invitation.invite_code
    )
}
