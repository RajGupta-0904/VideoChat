import CallNotification from '@/components/CallNotification'
import ListOnlineUsers from '@/components/ListOnlineUsers'
import VideoCall from '@/components/VideoCall'
import React from 'react'

const page = () => {
  return (
    <div>
      <ListOnlineUsers/>
      <CallNotification/>
      <VideoCall/>
    </div>
  )
}

export default page