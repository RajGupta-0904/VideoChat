import { OngoingCall, Participants, PeerData, SocketUser } from "@/types";
import { useUser } from "@clerk/nextjs";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import Peer, { SignalData } from 'simple-peer'

interface iSocketContext{
    onlineUsers:SocketUser[] | null
    ongoingCall:OngoingCall | null
    localStream:MediaStream | null
    peer:PeerData|null
    isCallEnded:boolean
    handleCall:(user:SocketUser) => void
    handleJoinCall:(ongoingCall:OngoingCall)=> void
    handleHangup:(data:{ongoingCall?:OngoingCall,isEmitHangup?:boolean})=>void
}

export const SocketContext = createContext<iSocketContext | null>(null);

export const SocketContextProvider =({children}:{children:React.ReactNode}) =>{
    const {user}=useUser()
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isSocketConnected, setisSocketConnected]=useState(false)
    const [onlineUsers , setOnlineUsers]=useState<SocketUser[] | null>(null);
    const [ongoingCall , setongoingCall]=useState<OngoingCall | null>(null);
    const [localStream, setLocalStream]=useState<MediaStream | null >(null);
    const [peer,setPeer]=useState<PeerData |null>(null);
    const [isCallEnded,setIsCallEnded]=useState(false);
    //initizing a socket
    // console.log("onlineUsers" ,onlineUsers)
    // console.log("isConnected",isSocketConnected);
    //establish the socket connections 
    const currSocketUser =onlineUsers?.find(onlineUser => onlineUser.userId === user?.id)
    const getMediaStream=useCallback(async(faceMode?:string)=>{
        if(localStream) return localStream;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            const stream =await navigator.mediaDevices.getUserMedia({
                audio:true,
                video:{
                    width :{min :640,ideal:1200,max:1920},
                    height:{min:360,ideal:720,max:1050},
                    frameRate:{min:16,ideal:30,max:30},
                    facingMode:videoDevices.length >0 ?faceMode :undefined
                }
            });
            setLocalStream(stream)
            return stream;
        } catch (error) {
            console.log("Failed to get the strwam ", error);
            setLocalStream(null);
            return null;
        }
    },[localStream]);

    

    const handleCall =useCallback( async (user:SocketUser)=>{
        setIsCallEnded(false)
        if(!currSocketUser || !socket) return ;
        const stream=await  getMediaStream();
        if(!stream){
            console.log("No stream in handle call")
            return;
        }
        const participants={caller:currSocketUser, receiver:user}
        setongoingCall({
            participants,
            isRinging:false
        })
        socket.emit('call',participants);
    },[socket,currSocketUser,ongoingCall])

    const onIncomingCall =useCallback((participants:Participants)=>{
        setongoingCall({
            participants,
            isRinging:true
        })
    },[user,socket,ongoingCall]);

    const handleHangup=useCallback((data:{ongoingCall?:OngoingCall | null,isEmitHangup?:boolean})=>{
        if(socket && user && data?.ongoingCall && data?.isEmitHangup){
            socket.emit("hangup",{
                ongoingCall:data.ongoingCall,
                userHangingupId:user.id
            })
        };
        setongoingCall(null);
        setPeer(null);
        if(localStream){
            localStream.getTracks().forEach((track)=> track.stop());
            setLocalStream(null);
        }
        setIsCallEnded(true);
    },[localStream,socket,user])

    const createPeer = useCallback((stream:MediaStream,initiator:boolean)=>{
        const iceServers:RTCIceServer[]=[
            {
               urls:[
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302",
                "stun:stun3.l.google.com:19302",
               ] 
            }
        ]
        const peer=new Peer({
            stream,
            initiator,
            trickle:true,
            config:{iceServers}
        });
        peer.on('stream',(stream)=>{
            setPeer((prevPeer)=>{
                if(prevPeer){
                    return {...prevPeer,stream}
                }
                return prevPeer
            })
        });
        peer.on('error',console.error);
        peer.on('close',()=>handleHangup({}));

        const rtcPeerConnection:RTCPeerConnection=(peer as any)._pc
        rtcPeerConnection.oniceconnectionstatechange = async()=>{
            if(rtcPeerConnection.iceConnectionState === 'disconnected' || rtcPeerConnection.iceConnectionState === 'failed'){
                handleHangup({});
            }
            // ye bhi add kiya h 
            // else{
            //     console.warn("ICE connection failed. Closing peer connection.");
            //     peer.destroy();
            //     setPeer(null);
            //     handleHangup({});
            // }
            // yha tk
        }
        return peer;
    },[ongoingCall,setPeer]);

    const  completePeerConnection=useCallback(async(connectionData:{sdp:SignalData,ongoingCall:OngoingCall,isCaller:boolean})=>{
        if(!localStream) return;

        // maine add kiya h 
        if (peer && peer.peerConnection.destroyed) {
            console.warn("Peer connection is already destroyed, skipping signaling.");
            return;
        }
        // yha tk
        if(peer){
            //yha se 
            const rtcPeerConnection:RTCPeerConnection=(peer.peerConnection as any)._pc;
            if(rtcPeerConnection.signalingState === 'stable'){
                console.warn("Skipping SDP setLocalDescription :already in stable state");
                return;
            }
            // yha tk
            peer.peerConnection.signal(connectionData.sdp)
            return;
        }
        const newPeer =createPeer(localStream,true);
        setPeer({
            peerConnection:newPeer,
            participantUser:connectionData.ongoingCall.participants.receiver,
            stream:undefined
        });

        newPeer.on('signal',async (data:SignalData)=>{
            if(socket){
                //emiting offers
                socket.emit('webrtcSignal',{
                    sdp:data,
                    isCaller:true,
                    ongoingCall
                })
            }
        })
    },[localStream,createPeer,peer,ongoingCall])

    const handleJoinCall =useCallback(async(ongoingCall:OngoingCall)=>{
        //join call
        // console.log(ongoingCall)
        setIsCallEnded(false);
        setongoingCall(prev =>{
            if(prev){
                return {...prev,isRinging:false}
            }
            return prev;
        });
        const stream =await getMediaStream();
        if(!stream){
            console.log("Could not get stream in handleJoinCall");
            handleHangup({ongoingCall:ongoingCall ?ongoingCall:undefined,isEmitHangup:true})
            return;
        }
        //make peers 
        const newPeer =createPeer(stream,true);
        setPeer({
            peerConnection:newPeer,
            participantUser:ongoingCall.participants.caller,
            stream:undefined
        });

        newPeer.on('signal',async (data:SignalData)=>{
            if(socket){
                //emiting offers
                socket.emit('webrtcSignal',{
                    sdp:data,
                    isCaller:false,
                    ongoingCall
                })
            }
        })

    },[socket,currSocketUser])

// initating a socket
    useEffect(()=>{
        const newSocket= io()
        setSocket(newSocket);
        return ()=>{
            newSocket.disconnect();
        }
    },[user]);
    useEffect(()=>{
        if(socket === null) return;
        if(socket.connected){
          onConnect();  
        }
        function onConnect(){
            setisSocketConnected(true);
        }
        function onDisconnect(){
            setisSocketConnected(false);
        }
        socket.on('connect',onConnect);
        socket.on('disconnect',onDisconnect);
        return ()=>{
            socket.off('connect',onConnect);
            socket.off('disconnect',onDisconnect)
        }
    },[socket]);
    //set online users
    useEffect(()=>{
        if(!socket || !isSocketConnected) return;
        socket.emit('addNewUser',user);
        socket.on('getUsers',(res)=>{
            setOnlineUsers(res);
        })
        return ()=>{
            socket.off('getUsers',(res)=>{
            setOnlineUsers(res);
        });
        }
    },[socket,isSocketConnected,user])

    // calls
    useEffect(()=>{
        if(!socket || !isSocketConnected) return;

        socket.on("incomingCall",onIncomingCall);
        socket.on("webrtcSignal",completePeerConnection);
        socket.on('hangup',handleHangup)


        return ()=>{
            socket.off('incomingCall',onIncomingCall)
            socket.off("webrtcSignal",completePeerConnection)
            socket.off('hangup',handleHangup)
        }
    },[socket,isSocketConnected,user,onIncomingCall,completePeerConnection]);

    useEffect(()=>{
        let timeout:ReturnType<typeof setTimeout>
        if(isCallEnded){
            timeout=setTimeout(()=>{
                setIsCallEnded(false)
            },2000)
        }
        return ()=>clearInterval(timeout)
    },[isCallEnded])

    return <SocketContext.Provider value={{
        onlineUsers,
        ongoingCall,
        localStream,
        peer,
        isCallEnded,
        handleCall,
        handleJoinCall,
        handleHangup
    }}>
        {children}
    </SocketContext.Provider>
}
export const useSocket =()=>{
    const  context=useContext(SocketContext);
    if(context === null){
        throw new Error("useSocket must be used within a SocketContextProvider")
    }
    return context;
}