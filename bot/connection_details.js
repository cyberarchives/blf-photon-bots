class ConnectionCredentials {
    constructor(address, secret = null, roomId = null) {
      this.address = address;
      this.secret = secret;
      this.roomId = roomId;
    }
  
    get host() {
      return this.address.split('://')[1].split(':')[0];
    }
  
    get port() {
      return parseInt(this.address.split('://')[1].split(':')[1], 10);
    }
  
    get hasSecret() {
      return this.secret != null;
    }
  
    get hasRoomId() {
      return this.roomId != null;
    }
  }
  
  module.exports = { ConnectionCredentials };