"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Generate a random room ID
    const randomRoomId = Math.random().toString(36).substring(2, 8)
    router.push(`/game/${randomRoomId}`)
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg">Creating game room...</div>
    </div>
  )
} 