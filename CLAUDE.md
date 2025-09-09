# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Goal Challenge** is a React-based weekly goal tracking application built with Vite, TypeScript, and Tailwind CSS. It features a kanban-style interface for managing goals across categories with milestone-based progress tracking, daily habit grids, and Firebase integration for authentication and real-time data sync.

## Development Commands

- `npm install` - Install dependencies
- `npm run dev` - Start Vite development server (typically http://localhost:5173)
- `npm run build` - TypeScript compilation + production build
- `npm run preview` - Preview production build locally

## Architecture & Key Directories

**Tech Stack**: React 18 + TypeScript + Vite + Tailwind CSS + Firebase + Framer Motion

```
src/
├── components/           # Reusable UI components
│   ├── ConfirmDialog.tsx    # Modal confirmation dialogs
│   ├── MilestoneCard.tsx    # Achievement milestone display
│   ├── SortableGoal.tsx     # Drag-and-drop goal cards
│   ├── ThemeProvider.tsx    # Theme context provider
│   ├── ThemeToggle.tsx      # Light/dark theme toggle button
│   └── Toast.tsx            # Notification toasts
├── lib/                 # Core business logic and utilities
│   ├── core.ts             # TypeScript types and utility functions
│   ├── store.ts            # Firebase/localStorage data layer abstraction
│   ├── metrics.ts          # Analytics and tracking logic
│   ├── report.ts           # AI report generation
│   └── theme.ts            # Theme context and localStorage logic
├── pages/               # Main application pages (Auth, Dashboard, Profile)
├── App.tsx              # Main application component with routing
└── main.tsx             # React app entry point with ThemeProvider
```

## Key Technical Patterns

- **Dual persistence**: localStorage + Firestore for offline-first functionality
- **Custom hooks pattern** for state management throughout components  
- **Dark/Light theme**: Context-based theme system with localStorage persistence
- **IST timezone handling** for week calculations (Indian Standard Time)
- **Milestone-based progress** (20%, 50%, 80%+ completion levels)
- **Drag-and-drop** using @dnd-kit for goal reordering within categories
- **Real-time sync** between client storage and Firebase Firestore

## Environment Setup

Requires `.env` file with Firebase configuration variables (all prefixed with `VITE_`):
- Firebase API keys, project ID, auth domain, etc.
- Backend API URL for additional services

## Important Notes

- **No testing framework** currently configured (recommend adding Vitest)
- **No linting/formatting** tools configured (recommend ESLint + Prettier)
- **Dark mode enabled** with class-based Tailwind configuration
- Firebase authentication supports Google and other social providers
- Mobile-first responsive design with Tailwind breakpoints
- Week calculations are timezone-aware for consistent goal periods
- Theme toggle positioned between user icon and sign out/sign in buttons