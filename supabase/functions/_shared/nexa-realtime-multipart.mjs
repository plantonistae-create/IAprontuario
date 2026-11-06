// The Realtime calls endpoint accepts SDP and session as multipart text fields.
// Keep the offer literal; this helper never logs or transmits it.
export function createRealtimeOfferForm(sdp, session) {
  const form = new FormData();
  form.set('sdp', sdp);
  form.set('session', JSON.stringify(session));
  return form;
}
