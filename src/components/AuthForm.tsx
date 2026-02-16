import React, { useState } from 'react';
import { signIn, signUp } from '../lib/database';
import { Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';
import { colors } from '../lib/designSystem';

interface AuthFormProps {
  onSuccess: () => void;
}

export default function AuthForm({ onSuccess }: AuthFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await signIn(formData.email, formData.password);
      if (error) throw error;
      onSuccess();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  return (
    <div className="auth-background flex items-center justify-center">
      {/* Static Gradient Orbs */}
      <div className="gradient-orb gradient-orb-1" />
      <div className="gradient-orb gradient-orb-2" />
      <div className="gradient-orb gradient-orb-3" />

      {/* Static Square Shapes */}
      <div className="geometric-shape shape-square" />
      <div className="geometric-shape shape-square-2" />
      <div className="geometric-shape shape-square-3" />

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="backdrop-blur-sm p-10 shadow-xl rounded-xl" style={{
          background: colors.bg.white + 'E6', // 90% opacity
          border: `1px solid ${colors.border.light}`
        }}>
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img
              src="https://yt3.googleusercontent.com/ytc/AIdro_lQ6KhO739Y9QuJQJu3pJ5sSNHHCwPuL_q0SZIn3i5x6g=s900-c-k-c0x00ffffff-no-rj"
              alt="Traidenis Logo"
              className="w-16 h-16 object-contain rounded-lg shadow-md"
            />
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold mb-2" style={{ color: colors.text.primary }}>
              Prisijungti prie Traidenis
            </h1>
            <p className="text-sm" style={{ color: colors.text.secondary }}>
              Duomenų bazė
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>
                El. paštas
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="el.pastas@pavyzdys.lt"
                className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                style={{
                  borderColor: colors.border.default,
                  background: colors.bg.white,
                  color: colors.text.primary
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                required
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>
                Slaptažodis
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="Įveskite slaptažodį"
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none pr-12"
                  style={{
                    borderColor: colors.border.default,
                    background: colors.bg.white,
                    color: colors.text.primary
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                  onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 transition-colors"
                  style={{ color: colors.text.tertiary }}
                  onMouseEnter={(e) => e.currentTarget.style.color = colors.text.secondary}
                  onMouseLeave={(e) => e.currentTarget.style.color = colors.text.tertiary}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="alert alert-soft alert-error text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 rounded-lg text-base font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mt-6 transition-all"
              style={{
                background: colors.interactive.accent,
                color: '#ffffff'
              }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = colors.interactive.accentHover)}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.background = colors.interactive.accent)}
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                  <span>Jungiamasi...</span>
                </div>
              ) : (
                'Prisijungti'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}