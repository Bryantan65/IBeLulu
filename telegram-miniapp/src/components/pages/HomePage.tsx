'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getTelegramUser } from '@/lib/telegram'
import './HomePage.css'

export default function HomePage() {
  const router = useRouter()
  const [userName, setUserName] = useState<string | null>(null)

  useEffect(() => {
    const user = getTelegramUser()
    if (user?.first_name) setUserName(user.first_name)
  }, [])

  return (
    <div className="home">
      <div className="home__header">
        <div className="home__logo">&#x1F3D8;</div>
        <h1 className="home__title">Lulu Town Council</h1>
        {userName && (
          <p className="home__greeting">Hello, {userName}!</p>
        )}
        <p className="home__subtitle">How can we help you today?</p>
      </div>

      <div className="home__cards">
        <button className="home__card" onClick={() => router.push('/submit')}>
          <span className="home__card-icon">&#x1F4DD;</span>
          <div className="home__card-content">
            <span className="home__card-title">Submit Complaint</span>
            <span className="home__card-desc">Report an issue in your area</span>
          </div>
          <span className="home__card-arrow">&#x203A;</span>
        </button>

        <button className="home__card" onClick={() => router.push('/complaints')}>
          <span className="home__card-icon">&#x1F4CB;</span>
          <div className="home__card-content">
            <span className="home__card-title">My Complaints</span>
            <span className="home__card-desc">View status of your reports</span>
          </div>
          <span className="home__card-arrow">&#x203A;</span>
        </button>
      </div>

      <div className="home__footer">
        <p className="home__emergency">
          &#x1F4DE; Urgent? Call <strong>6123-4567</strong>
        </p>
      </div>
    </div>
  )
}
