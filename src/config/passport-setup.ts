import { logger } from '../utils/logger'
import passport from 'passport'
import { prismaClient } from '../application/database'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${process.env.BASE_URL}/api/auth/google/callback`,
      scope: ['profile', 'email']
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile._json.email
        if (!email) {
          logger.warn('Google OAuth: no email in profile')
          return done(null, false)
        }

        const user = await prismaClient.user.findUnique({
          where: { email },
          include: { orgUnit: true }
        })

        if (user) {
          logger.info(`Google login successful for existing user: ${user.email}`)
          return done(null, user)
        } else {
          logger.warn(`Google login failed for unregistered email: ${email}`)
          return done(null, false)
        }
      } catch (error) {
        logger.error('Error during Google OAuth strategy:', error)
        return done(error as Error, false)
      }
    }
  )
)
