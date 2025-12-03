
import { useState, useEffect } from 'react';
import { ApiKeys, AIProvider } from '../services/aiService';

export const useSettings = () => {
  // Theme
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'dark');
  
  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => {
    const saved = localStorage.getItem('apiKeys');
    return saved ? JSON.parse(saved) : { grok: '', openai: '' };
  });

  // AI Provider
  const [aiProvider, setAiProvider] = useState<AIProvider>(() => (localStorage.getItem('aiProvider') as AIProvider) || 'gemini');

  // Rename Pattern
  const [renamePattern, setRenamePattern] = useState<string>(() => localStorage.getItem('renamePattern') || '[artist] - [title]');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('apiKeys', JSON.stringify(apiKeys));
    localStorage.setItem('aiProvider', aiProvider);
    localStorage.setItem('renamePattern', renamePattern);
  }, [apiKeys, aiProvider, renamePattern]);

  return {
    theme,
    setTheme,
    apiKeys,
    setApiKeys,
    aiProvider,
    setAiProvider,
    renamePattern,
    setRenamePattern
  };
};