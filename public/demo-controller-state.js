// Request identity and configuration validity are separate from synthetic weighing state.
export class DemoControllerState {
  constructor() { this.epoch = 0; this.tripId = null; this.valid = false; this.error = ''; this.request = null; this.api = {status:'idle',trip_id:null,message:''}; }
  clearRequest() { this.request?.controller.abort(); this.request = null; this.epoch++; this.api = {status:'idle',trip_id:null,message:''}; }
  invalidate(error) { this.clearRequest(); this.valid = false; this.error = error; }
  accept(tripId) { this.clearRequest(); this.tripId = tripId; this.valid = true; this.error = ''; }
  begin(tripId) {
    if (!this.valid || tripId !== this.tripId) throw Error('Configuration or trip is no longer valid');
    this.clearRequest();
    const request = {epoch:this.epoch,tripId,controller:new AbortController()};
    this.request = request; this.api = {status:'pending',trip_id:tripId,message:''}; return request;
  }
  finish(request,status,message) {
    if (!this.valid || this.request !== request || request.epoch !== this.epoch || request.tripId !== this.tripId) return false;
    this.api = {status,trip_id:request.tripId,message}; this.request = null; return true;
  }
}
