/** NEXA 2.0: assistive-use, opt-in transcript response contract. */
export function buildTranscriptProvenance({enabled=false,text='',provider='',transcriberModel='',structuringModel='',pipelineVersion='',sourceEventId='',sourceKind='final'}={}){
 if(enabled!==true) return null;
 if(typeof text!=='string'||!text.trim()||text.length>400000) return null;
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(sourceEventId)) return null;
 if(!['final','verified_diarization'].includes(sourceKind)) return null;
 return {
  schema_version:'nexa-transcript-v1',
  original_final_text:text,
  structuring_input_text:text,
  source_kind:sourceKind,
  source_event_id:sourceEventId,
  provider:String(provider).slice(0,80),
  transcriber_model:String(transcriberModel).slice(0,160),
  structuring_model:String(structuringModel).slice(0,160),
  pipeline_version:String(pipelineVersion).slice(0,120),
  training_eligible:false
 };
}
