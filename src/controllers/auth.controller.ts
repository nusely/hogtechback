import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import enhancedEmailService from '../services/enhanced-email.service';
import { successResponse, errorResponse } from '../utils/responseHandlers';

export class AuthController {
  // Sign up user via Admin API (bypasses Supabase email sending)
  async signUp(req: Request, res: Response) {
    try {
      const { email, password, firstName, lastName, phone } = req.body;

      if (!email || !password) {
        return errorResponse(res, 'Email and password are required', 400);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return errorResponse(res, 'Invalid email format', 400);
      }

      // Validate password strength
      if (password.length < 6) {
        return errorResponse(res, 'Password must be at least 6 characters', 400);
      }

      // Check if user already exists
      try {
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (!listError && users) {
          const existingUser = users.find((u: any) => u.email === email);
          if (existingUser) {
            return errorResponse(res, 'User with this email already exists', 409);
          }
        }
      } catch (error) {
        console.warn('Error checking user existence:', error);
      }

      // Create user via Admin API WITHOUT triggering email sending
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: false, // Don't send Supabase email - we'll send via Resend
        user_metadata: {
          first_name: firstName || '',
          last_name: lastName || '',
          phone: phone || '',
        },
      });

      if (createError || !userData?.user) {
        console.error('Error creating user:', createError);
        
        // Check for duplicate email error
        if (createError?.message?.toLowerCase().includes('already registered') || 
            createError?.message?.toLowerCase().includes('already exists')) {
          return errorResponse(res, 'User with this email already exists', 409);
        }
        
        return errorResponse(res, createError?.message || 'Failed to create user', 500);
      }

      console.log(`✅ User created via Admin API: ${email}`);

      // Generate verification link
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: email,
        options: {
          redirectTo: `${frontendUrl}/auth/callback`,
        },
      });

      let verificationUrl: string;
      if (tokenError || !tokenData) {
        console.error('Error generating verification link:', tokenError);
        // Fallback: create a manual verification URL
        verificationUrl = `${frontendUrl}/auth/callback?token=manual&email=${encodeURIComponent(email)}`;
      } else {
        verificationUrl = tokenData.properties?.action_link || '';
        if (!verificationUrl) {
          const hashedToken = tokenData.properties?.hashed_token;
          if (hashedToken) {
            verificationUrl = `${frontendUrl}/auth/callback?token=${hashedToken}&type=magiclink&email=${encodeURIComponent(email)}`;
          } else {
            verificationUrl = `${frontendUrl}/auth/callback?email=${encodeURIComponent(email)}`;
          }
        }
      }

      // Send verification email via Resend (bypasses Supabase rate limits)
      const emailResult = await enhancedEmailService.sendVerificationEmail(
        email,
        verificationUrl,
        firstName
      );

      if (!emailResult.success) {
        console.error('Failed to send verification email:', emailResult.error);
        // User was created, but email sending failed - still return success
        // The user can request a new verification email later
      } else {
        console.log(`✅ Verification email sent via Resend to: ${email}`);
      }

      // Return user data (without sensitive info)
      return successResponse(
        res,
        {
          user: {
            id: userData.user.id,
            email: userData.user.email,
            email_confirmed_at: userData.user.email_confirmed_at,
            user_metadata: userData.user.user_metadata,
          },
        },
        'Account created successfully. Please check your email to verify your account.',
        201
      );
    } catch (error) {
      console.error('Error in signUp:', error);
      return errorResponse(res, 'Failed to create account', 500);
    }
  }

  // Send verification email via Resend (not Supabase)
  async sendVerificationEmail(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return errorResponse(res, 'Email is required', 400);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return errorResponse(res, 'Invalid email format', 400);
      }

      // Check if user exists in Supabase Auth by querying auth.users
      // We'll use listUsers with a filter, or query the users table
      let user: any = null;
      let firstName: string | undefined;
      
      try {
        // Try to find user by email in auth.users
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (!listError && users) {
          user = users.find((u: any) => u.email === email);
        }
        
        // If found, get first name from metadata
        if (user) {
          firstName = user.user_metadata?.first_name || user.user_metadata?.firstName;
        }
      } catch (error) {
        console.warn('Error checking user existence:', error);
      }

      // Generate verification token using Supabase Admin API
      // Use 'magiclink' type for email verification (doesn't require password)
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      let verificationUrl: string;
      
      // Generate a magic link for email verification
      const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: email,
        options: {
          redirectTo: `${frontendUrl}/auth/callback`,
        },
      });

      if (tokenError || !tokenData) {
        console.error('Error generating verification link:', tokenError);
        // Fallback: create a manual verification URL
        verificationUrl = `${frontendUrl}/auth/callback?token=manual&email=${encodeURIComponent(email)}`;
      } else {
        // Use the action_link from the response (this is the full URL to use)
        verificationUrl = tokenData.properties?.action_link || '';
        
        // If no action_link, try to construct from properties
        if (!verificationUrl) {
          // Fallback: use the properties to construct URL
          const hashedToken = tokenData.properties?.hashed_token;
          if (hashedToken) {
            verificationUrl = `${frontendUrl}/auth/callback?token=${hashedToken}&type=magiclink&email=${encodeURIComponent(email)}`;
          } else {
            // Last resort: use email-based verification
            verificationUrl = `${frontendUrl}/auth/callback?email=${encodeURIComponent(email)}`;
          }
        }
      }

      // Send verification email via Resend
      const emailResult = await enhancedEmailService.sendVerificationEmail(
        email,
        verificationUrl,
        firstName
      );

      if (!emailResult.success) {
        return errorResponse(res, emailResult.error || 'Failed to send verification email', 500);
      }

      console.log(`✅ Verification email sent via Resend to: ${email}`);
      return successResponse(res, {}, 'Verification email sent successfully', 200);
    } catch (error) {
      console.error('Error in sendVerificationEmail:', error);
      return errorResponse(res, 'Failed to send verification email', 500);
    }
  }

  // Send password reset email via Resend (not Supabase)
  async sendPasswordResetEmail(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return errorResponse(res, 'Email is required', 400);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return errorResponse(res, 'Invalid email format', 400);
      }

      // Check if user exists in Supabase Auth by querying auth.users
      let user: any = null;
      let firstName: string | undefined;
      
      try {
        // Try to find user by email in auth.users
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (!listError && users) {
          user = users.find((u: any) => u.email === email);
        }
        
        // If found, get first name from metadata
        if (user) {
          firstName = user.user_metadata?.first_name || user.user_metadata?.firstName;
        }
      } catch (error) {
        console.warn('Error checking user existence:', error);
      }

      // Don't reveal if user exists or not (security best practice)
      // Always generate a recovery link (even if user doesn't exist)
      // Generate password reset token using Supabase Admin API
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: email,
        options: {
          redirectTo: `${frontendUrl}/reset-password`,
        },
      });

      if (tokenError || !tokenData) {
        // Don't reveal failure to user (security best practice)
        console.error('Error generating password reset link:', tokenError);
        // Still return success to prevent email enumeration
        return successResponse(res, {}, 'If an account exists with this email, a password reset link has been sent', 200);
      }

      // Get the reset URL from the token data
      let resetUrl = tokenData.properties?.action_link || '';
      
      console.log('Password reset token data:', {
        hasActionLink: !!tokenData.properties?.action_link,
        hasHashedToken: !!tokenData.properties?.hashed_token,
        actionLink: tokenData.properties?.action_link,
        properties: Object.keys(tokenData.properties || {}),
      });
      
      // If no action_link, try to construct from properties
      if (!resetUrl) {
        const hashedToken = tokenData.properties?.hashed_token;
        if (hashedToken) {
          resetUrl = `${frontendUrl}/reset-password?token=${hashedToken}&type=recovery&email=${encodeURIComponent(email)}`;
          console.log('Constructed reset URL from hashed_token');
        } else {
          // Last resort: use email-based reset
          resetUrl = `${frontendUrl}/reset-password?email=${encodeURIComponent(email)}`;
          console.log('Using email-based reset URL (fallback)');
        }
      } else {
        console.log('Using action_link from token data');
      }

      console.log('Final reset URL:', resetUrl);
      console.log('Reset URL length:', resetUrl.length);

      // Send password reset email via Resend
      const emailResult = await enhancedEmailService.sendPasswordResetEmail(
        email,
        resetUrl,
        firstName
      );

      if (!emailResult.success) {
        // Don't reveal failure to user (security best practice)
        console.error('Failed to send password reset email:', emailResult.error);
        // Still return success to prevent email enumeration
        return successResponse(res, {}, 'If an account exists with this email, a password reset link has been sent', 200);
      }

      console.log(`✅ Password reset email sent via Resend to: ${email}`);
      return successResponse(res, {}, 'If an account exists with this email, a password reset link has been sent', 200);
    } catch (error) {
      console.error('Error in sendPasswordResetEmail:', error);
      // Don't reveal failure to user (security best practice)
      return successResponse(res, {}, 'If an account exists with this email, a password reset link has been sent', 200);
    }
  }
}

export default new AuthController();

