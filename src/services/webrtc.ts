/**
 * WebRTC 1-to-1 Video & Audio Peer Connection Service
 */

export interface WebRTCEvents {
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onSignalData: (signal: any) => void;
  onError: (error: any) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private videoSender: RTCRtpSender | null = null;
  private audioSender: RTCRtpSender | null = null;
  private events: WebRTCEvents;
  private isInitiator: boolean = false;

  constructor(events: WebRTCEvents) {
    this.events = events;
  }

  public async initializePeerConnection(localStream: MediaStream, isInitiator: boolean = false) {
    this.localStream = localStream;
    this.isInitiator = isInitiator;
    this.remoteStream = new MediaStream();

    this.peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to peer connection
    localStream.getTracks().forEach((track) => {
      if (this.peerConnection && this.localStream) {
        const sender = this.peerConnection.addTrack(track, this.localStream);
        if (track.kind === 'video') this.videoSender = sender;
        if (track.kind === 'audio') this.audioSender = sender;
      }
    });

    // Handle remote track arrival
    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        if (this.remoteStream) {
          this.remoteStream.addTrack(track);
        }
      });
      this.events.onRemoteStream(event.streams[0] || this.remoteStream);
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.events.onSignalData({
          type: 'candidate',
          candidate: event.candidate,
        });
      }
    };

    // Monitor connection states
    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        this.events.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };

    // If caller/initiator, create offer
    if (this.isInitiator) {
      try {
        const offer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await this.peerConnection.setLocalDescription(offer);
        this.events.onSignalData({
          type: 'offer',
          sdp: offer,
        });
      } catch (err) {
        this.events.onError(err);
      }
    }
  }

  public async handleSignal(signal: any) {
    if (!this.peerConnection) return;

    try {
      if (signal.type === 'offer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.events.onSignalData({
          type: 'answer',
          sdp: answer,
        });
      } else if (signal.type === 'answer') {
        if (this.peerConnection.signalingState !== 'stable') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (candidateErr) {
          console.warn('Error adding ICE candidate:', candidateErr);
        }
      }
    } catch (err) {
      this.events.onError(err);
    }
  }

  /**
   * Screen sharing track replacement
   */
  public async toggleScreenShare(isSharing: boolean): Promise<boolean> {
    if (!this.peerConnection || !this.videoSender) return false;

    try {
      if (isSharing) {
        // Start screen capture
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        const screenTrack = this.screenStream.getVideoTracks()[0];
        await this.videoSender.replaceTrack(screenTrack);

        // When user stops screen sharing via browser native floating bar
        screenTrack.onended = async () => {
          await this.revertToCameraTrack();
        };

        return true;
      } else {
        await this.revertToCameraTrack();
        return false;
      }
    } catch (err) {
      console.warn('Screen share toggle failed:', err);
      return false;
    }
  }

  private async revertToCameraTrack() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    if (this.localStream && this.videoSender) {
      const cameraTrack = this.localStream.getVideoTracks()[0];
      if (cameraTrack) {
        await this.videoSender.replaceTrack(cameraTrack);
      }
    }
  }

  public updateAudioTrack(newTrack: MediaStreamTrack) {
    if (this.audioSender) {
      this.audioSender.replaceTrack(newTrack);
    }
  }

  public close() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}
