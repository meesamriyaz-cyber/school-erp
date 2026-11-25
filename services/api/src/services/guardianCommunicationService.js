import { randomUUID } from "node:crypto";

const cleanEnv = (value) => (value || "").trim();

function normalizeE164(value, label) {
  const normalized = String(value || "").trim().replace(/^whatsapp:/i, "").replace(/[\\s().-]/g, "");
  if (!/^\\+[1-9]\\d{7,14}$/.test(normalized)) throw new Error(`${label} must use international E.164 format (for example +919876543210)`);
  return normalized;
}
const normalizeWhatsAppAddress = (value, label) => `whatsapp:${normalizeE164(value, label)}`;

async function msg91Send({ recipient, body }) {
  const authKey = cleanEnv(process.env.MSG91_AUTH_KEY);
  const flowId = cleanEnv(process.env.MSG91_SMS_FLOW_ID);
  const sender = cleanEnv(process.env.MSG91_SMS_SENDER_ID);
  const variableName = cleanEnv(process.env.MSG91_SMS_MESSAGE_VARIABLE) || "message";
  if (!authKey || !flowId || !sender) throw new Error("MSG91 SMS is not configured: set MSG91_AUTH_KEY, MSG91_SMS_FLOW_ID and MSG91_SMS_SENDER_ID");
  if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(variableName)) throw new Error("MSG91_SMS_MESSAGE_VARIABLE must be a valid template variable name");
  const mobiles = normalizeE164(recipient, "Guardian SMS number").slice(1);
  const correlationId = randomUUID();
  let response;
  try {
    response = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: authKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ template_id: flowId, sender, recipients: [{ mobiles, [variableName]: body, CRQID: correlationId }] }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error("MSG91 request timed out after 15 seconds");
    throw new Error("Unable to connect to MSG91. Check the API server's internet connection.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.type === "error" || result.hasError === true || result.status === "error") {
    throw new Error(`MSG91: ${String(result.message || result.msg || result.errors?.[0]?.message || `request failed (${response.status})`).slice(0, 200)}`);
  }
  const requestId = result.message || result.requestId || result.data?.message || result.data?.requestId;
  if (!requestId) throw new Error("MSG91 did not return a request ID; SMS acceptance could not be confirmed");
  return { messageId: correlationId, providerRequestId: String(requestId), providerStatus: "accepted", providerErrorCode: null, providerErrorMessage: null };
}

async function twilioSend({ to, body, from, accountSid, authToken, contentSid }) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const payload = { To: to, From: from, ContentSid: contentSid, ContentVariables: JSON.stringify({ "1": body }) };
  const callbackUrl = cleanEnv(process.env.TWILIO_STATUS_CALLBACK_URL);
  if (callbackUrl) payload.StatusCallback = callbackUrl;
  let response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json",
    }, body: new URLSearchParams(payload).toString(), signal: AbortSignal.timeout(15000) });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error("Twilio request timed out after 15 seconds");
    throw new Error("Unable to connect to Twilio. Check the API server's internet connection.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${result.message || `Twilio request failed (${response.status})`}${result.code ? ` (Twilio code ${result.code})` : ""}`);
  return { messageId: result.sid || null, providerStatus: result.status || "accepted", providerErrorCode: result.error_code == null ? null : String(result.error_code), providerErrorMessage: result.error_message || null };
}

export async function sendGuardianChannel({ channel, recipient, message, subject }) {
  if (channel === "sms") return msg91Send({ recipient, body: message });

  if (channel === "whatsapp") {
    const accountSid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
    const authToken = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
    const configuredFrom = cleanEnv(process.env.TWILIO_WHATSAPP_FROM);
    const contentSid = cleanEnv(process.env.TWILIO_WHATSAPP_CONTENT_SID);
    if (!accountSid || !authToken || !configuredFrom) throw new Error("WhatsApp delivery is not configured: check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM");
    if (!/^AC[a-fA-F0-9]{32}$/.test(accountSid)) throw new Error("TWILIO_ACCOUNT_SID must be a valid Twilio Account SID beginning with AC");
    if (!/^HX[a-fA-F0-9]{32}$/.test(contentSid)) throw new Error("WhatsApp delivery requires a valid TWILIO_WHATSAPP_CONTENT_SID approved template");
    return twilioSend({ to: normalizeWhatsAppAddress(recipient, "Guardian WhatsApp number"), body: message, from: normalizeWhatsAppAddress(configuredFrom, "TWILIO_WHATSAPP_FROM"), accountSid, authToken, contentSid });
  }
  if (channel === "email") {
    const apiKey = cleanEnv(process.env.RESEND_API_KEY);
    const from = cleanEnv(process.env.COMMUNICATION_FROM_EMAIL);
    if (!apiKey || !from) throw new Error("Email delivery is not configured on the API server");
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [recipient], subject: subject || "School update", text: message }), signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Email provider request failed (${response.status})`);
    return { messageId: result.id || null, providerStatus: "accepted", providerErrorCode: null, providerErrorMessage: null };
  }
  throw new Error("Unsupported communication channel");
}
