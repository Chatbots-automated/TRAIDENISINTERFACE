import React, { useState } from 'react';
import { signIn, signUp } from '../lib/supabase';
import { Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';

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

      {/* Login Card - macOS Style */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="macos-animate-spring bg-white/90 backdrop-blur-macos rounded-macos-xl p-10 shadow-macos-window border-[0.5px] border-black/10">
          {/* macOS Window Controls (decorative) */}
          <div className="absolute top-4 left-4 macos-window-controls">
            <div className="macos-dot macos-dot-close opacity-60" />
            <div className="macos-dot macos-dot-minimize opacity-60" />
            <div className="macos-dot macos-dot-maximize opacity-60" />
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-8 mt-4">
            <img
              src="https://yt3.googleusercontent.com/ytc/AIdro_lQ6KhO739Y9QuJQJu3pJ5sSNHHCwPuL_q0SZIn3i5x6g=s900-c-k-c0x00ffffff-no-rj"
              alt="Traidenis Logo"
              className="w-16 h-16 object-contain rounded-macos-lg shadow-macos"
            />
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-macos-gray-900 mb-2 tracking-macos-tight">
              Log into Traidenis
            </h1>
            <p className="text-macos-gray-500 text-sm">
              High-Performance Knowledge Base
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium text-macos-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="email@example.com"
                className="w-full macos-input rounded-macos text-macos-gray-900"
                required
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium text-macos-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="Enter your password"
                  className="w-full macos-input rounded-macos text-macos-gray-900 pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-macos-gray-400 hover:text-macos-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start space-x-2 p-3 rounded-macos bg-macos-red/10 border-[0.5px] border-macos-red/20">
                <AlertCircle className="w-5 h-5 text-macos-red flex-shrink-0 mt-0.5" />
                <span className="text-sm text-macos-red">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full macos-btn macos-btn-primary py-3 px-6 rounded-macos text-base font-medium shadow-macos-lg hover:shadow-macos-xl disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                  <span>Signing in...</span>
                </div>
              ) : (
                'Log in'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}