// Offline, strictly SYNTHETIC WebRTC negotiation lab.
// Never captures browser SDP, audio, transcripts, credentials or actual device data.
// No network requests and no imports from clinical runtime.

const SYNTHETIC_OFFER='v=0\r\ns=synthetic\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const SYNTHETIC_CANDIDATE='a=candidate:0 1 udp 100 192.0.2.10 40000 typ host\r\n';

function candidateCount(sdp){
 return (sdp.match(/^a=candidate:/gm)||[]).length;
}

export function reproduceSyntheticOfferRace(){
 const offer=Object.freeze({type:'offer',sdp:SYNTHETIC_OFFER});
 // Fake RTCPeerConnection: after setLocalDescription, ICE adds a candidate
 // to localDescription; createOffer's snapshot remains the same.
 const mockPc={
  localDescription:null,
  iceGatheringState:'new',
  async createOffer(){return offer;},
  async setLocalDescription(value){
   this.localDescription={type:value.type,sdp:value.sdp};
   this.iceGatheringState='gathering';
  },
  completeIce(){
   this.localDescription={type:'offer',sdp:SYNTHETIC_OFFER+SYNTHETIC_CANDIDATE};
   this.iceGatheringState='complete';
  },
 };
 return (async()=>{
  const initial=await mockPc.createOffer();
  await mockPc.setLocalDescription(initial);
  const sentImmediatelyCandidateCount=candidateCount(initial.sdp);
  mockPc.completeIce();
  return Object.freeze({
   fixture_only:true,
   offer_snapshot_candidate_count:sentImmediatelyCandidateCount,
   complete_local_description_candidate_count:candidateCount(mockPc.localDescription.sdp),
   ice_gathering_state:mockPc.iceGatheringState,
   candidate_can_be_missing_when_sending_offer_snapshot:
    sentImmediatelyCandidateCount<candidateCount(mockPc.localDescription.sdp),
   proves_real_upstream_502_cause:false,
   provider_request_count:0,
   clinical_runtime_modified:false,
  });
 })();
}

// Mirrors current Edge's status conversion ONLY for deterministic thought experiments.
// This is NOT provider telemetry or evidence for any real incident.
export function syntheticEdgeEnvelope(providerHttpStatus){
 if(!Number.isInteger(providerHttpStatus)||providerHttpStatus<100||providerHttpStatus>599)
  throw new Error('INVALID_SYNTHETIC_STATUS');
 const success=providerHttpStatus>=200&&providerHttpStatus<300;
 return Object.freeze({
  fixture_only:true,
  simulated_provider_http_status:providerHttpStatus,
  simulated_edge_http_status:success?200:502,
  provider_invoice_known:false,
  is_production_observation:false,
 });
}
