"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Generate a random 6-digit room ID
    const randomRoomId = Math.floor(100000 + Math.random() * 900000)
    router.push(`/game/${randomRoomId}`)
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg">Creating game room...</div>
    </div>
  )
} 