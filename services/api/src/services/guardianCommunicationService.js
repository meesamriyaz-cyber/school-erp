const formBody = (values) => new URLSearchParams(values).toString();

async function twilioSend({ to, body, from, accountSid, authToken, contentSid }) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const payload = { To: to, Body: body, From: from };
  if (contentSid) { delete payload.Body; payload.ContentSid = contentSid; payload.ContentVariables = JSON.stringify({ "1": body }); }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Twilio request failed (${response.status})`);
  return result.sid || null;
}

export async function sendGuardianChannel({ channel, recipient, message, subject }) {
  if (channel === "sms" || channel === "whatsapp") {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
    const from = channel === "sms" ? process.env.TWILIO_SMS_FROM : process.env.TWILIO_WHATSAPP_FROM;
    const contentSid = channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_CONTENT_SID : null;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !from || (channel === "whatsapp" && !contentSid)) {
      throw new Error(`${channel.toUpperCase()} delivery is not configured on the API server`);
    }
    const to = channel === "whatsapp" ? `whatsapp:${recipient}` : recipient;
    const sender = channel === "whatsapp" && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from;
    return twilioSend({ to, body: message, from: sender, accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, contentSid });
  }

  if (channel === "email") {
    const { RESEND_API_KEY, COMMUNICATION_FROM_EMAIL } = process.env;
    if (!RESEND_API_KEY || !COMMUNICATION_FROM_EMAIL) throw new Error("Email delivery is not configured on the API server");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: COMMUNICATION_FROM_EMAIL, to: [recipient], subject: subject || "School update", text: message }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Email provider request failed (${response.status})`);
    return result.id || null;
  }
  throw new Error("Unsupported communication channel");
}
