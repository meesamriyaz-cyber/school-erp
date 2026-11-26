const formBody = (values) => new URLSearchParams(values).toString();

const cleanEnv = (value) => (value || "").trim();

function normalizeE164(value, label) {
  const raw = String(value || "").trim().replace(/^whatsapp:/i, "");
  // Permit common visual separators, but never guess a country calling code.
  const normalized = raw.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error(`${label} must use international E.164 format (for example +919876543210)`);
  }
  return normalized;
}

function normalizeWhatsAppAddress(value, label) {
  return `whatsapp:${normalizeE164(value, label)}`;
}

async function twilioSend({ to, body, from, accountSid, authToken, contentSid }) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const payload = { To: to, From: from };
  if (contentSid) {
    payload.ContentSid = contentSid;
    payload.ContentVariables = JSON.stringify({ "1": body });
  } else {
    payload.Body = body;
  }

  const callbackUrl = cleanEnv(process.env.TWILIO_STATUS_CALLBACK_URL);
  if (callbackUrl) {
    let parsedCallback;
    try { parsedCallback = new URL(callbackUrl); } catch {
      throw new Error("TWILIO_STATUS_CALLBACK_URL must be a valid absolute URL");
    }
    if (parsedCallback.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new Error("TWILIO_STATUS_CALLBACK_URL must use HTTPS in production");
    }
    payload.StatusCallback = callbackUrl;
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: formBody(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error("Twilio request timed out after 15 seconds");
    }
    throw new Error("Unable to connect to Twilio. Check the API server's internet connection.");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = result.code ? ` (Twilio code ${result.code})` : "";
    throw new Error(`${result.message || `Twilio request failed (${response.status})`}${code}`);
  }
  return {
    messageId: result.sid || null,
    providerStatus: result.status || "accepted",
    providerErrorCode: result.error_code == null ? null : String(result.error_code),
    providerErrorMessage: result.error_message || null,
  };
}

export async function sendGuardianChannel({ channel, recipient, message, subject, guardianId }) {
  if (channel === "sms" || channel === "whatsapp") {
    const accountSid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
    const authToken = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
    const configuredFrom = channel === "sms"
      ? cleanEnv(process.env.TWILIO_SMS_FROM)
      : cleanEnv(process.env.TWILIO_WHATSAPP_FROM);
    const contentSid = cleanEnv(process.env.TWILIO_WHATSAPP_CONTENT_SID);

    if (!accountSid || !authToken || !configuredFrom) {
      throw new Error(`${channel.toUpperCase()} delivery is not configured: check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and ${channel === "sms" ? "TWILIO_SMS_FROM" : "TWILIO_WHATSAPP_FROM"} in services/api/.env`);
    }
    if (!/^AC[a-fA-F0-9]{32}$/.test(accountSid)) {
      throw new Error("TWILIO_ACCOUNT_SID must be a valid Twilio Account SID beginning with AC");
    }
    if (channel === "whatsapp" && !contentSid) {
      throw new Error("WhatsApp delivery requires TWILIO_WHATSAPP_CONTENT_SID for the approved template");
    }
    if (channel === "whatsapp" && !/^HX[a-fA-F0-9]{32}$/.test(contentSid)) {
      throw new Error("TWILIO_WHATSAPP_CONTENT_SID must be a valid Twilio Content Template SID beginning with HX");
    }

    const to = channel === "whatsapp"
      ? normalizeWhatsAppAddress(recipient, "Guardian WhatsApp number")
      : normalizeE164(recipient, "Guardian SMS number");
    const from = channel === "whatsapp"
      ? normalizeWhatsAppAddress(configuredFrom, "TWILIO_WHATSAPP_FROM")
      : configuredFrom;

    if (channel === "sms" && !/^\+[1-9]\d{7,14}$/.test(from)) {
      throw new Error("TWILIO_SMS_FROM must be a Twilio phone number in E.164 format (for example +15017122661)");
    }

    // Twilio trial accounts accept only Twilio's predefined SMS template tokens.
    // In non-production environments, use a supported event-notification template
    // instead of the School ERP message body. Production always uses the real message.
    const trialTemplate = cleanEnv(process.env.TWILIO_SMS_TRIAL_TEMPLATE) || "sms_event_notifications";
    const smsBody = channel === "sms" && process.env.NODE_ENV !== "production"
      ? trialTemplate
      : message;

    return twilioSend({
      to,
      body: smsBody,
      from,
      accountSid,
      authToken,
      contentSid: channel === "whatsapp" ? contentSid : null,
    });
  }

  if (channel === "email") {
    const apiKey = cleanEnv(process.env.RESEND_API_KEY);
    const from = cleanEnv(process.env.COMMUNICATION_FROM_EMAIL);
    if (!apiKey || !from) throw new Error("Email delivery is not configured on the API server");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [recipient], subject: subject || "School update", text: message, ...(guardianId ? { tags: [{ name: "guardian_id", value: String(guardianId) }, { name: "purpose", value: "guardian_email_verification" }] } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Email provider request failed (${response.status})`);
    return { messageId: result.id || null, providerStatus: "accepted", providerErrorCode: null, providerErrorMessage: null };
  }
  throw new Error("Unsupported communication channel");
}
