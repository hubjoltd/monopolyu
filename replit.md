# FormFlow - Google Forms Auto Submitter

## Overview

FormFlow is a web application that automates the submission of bulk data to Google Forms. Users can upload spreadsheet files (CSV/Excel), validate Google Form URLs, and submit records in configurable batches. The application provides real-time progress tracking, success notifications, and completion reports.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build Tool**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server for fast HMR and optimized production builds
- Wouter for lightweight client-side routing (alternative to React Router)

**UI Component System**
- Shadcn/ui component library built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Class Variance Authority (CVA) for component variant management
- Design system uses Google-inspired color scheme (primary blue, secondary teal, accent yellow)

**State Management**
- TanStack Query (React Query) for server state management, caching, and API synchronization
- Local React state for UI-specific interactions (form inputs, modals, progress tracking)
- Custom hooks for reusable logic (useToast, useAudio, useIsMobile)

**Form Handling**
- React Hook Form with Zod resolvers for type-safe form validation
- Drizzle-zod for automatic schema validation from database models

### Backend Architecture

**Server Framework**
- Express.js REST API server with TypeScript
- Middleware for request logging, JSON parsing, and raw body preservation
- Modular route registration pattern for scalability

**File Processing**
- Multer for multipart/form-data file uploads with memory storage
- XLSX library for parsing Excel (.xlsx, .xls) and CSV files
- File size limit: 10MB per upload
- Validates spreadsheet structure (headers + data rows)

**API Endpoints**
- `POST /api/forms/validate` - Validates Google Form URLs and extracts form structure
- `POST /api/sheets/upload` - Processes uploaded spreadsheet files
- `POST /api/submissions` - Creates new batch submission jobs
- Additional endpoints for batch management (implied by schema)

**Data Storage Strategy**
- Dual storage implementation: In-memory (MemStorage) and database-backed
- IStorage interface allows swapping storage backends without code changes
- Submissions stored with metadata: form URL, file name, batch configuration, progress tracking
- Batches track individual submission chunks with status and error handling

### Data Storage Solutions

**Database Configuration**
- PostgreSQL as the primary database (configured via Drizzle)
- Neon serverless PostgreSQL driver for connection management
- Connection pooling with connect-pg-simple for session management

**Schema Design**
- `submissions` table: Tracks overall submission jobs with JSON data column for records
- `batches` table: Tracks individual batch executions with foreign key to submissions
- UUID primary keys with automatic generation
- Timestamp tracking for created_at, updated_at, started_at, completed_at
- Status fields for workflow management (pending → processing → completed/failed)

**ORM & Migrations**
- Drizzle ORM for type-safe database queries
- Schema-first approach with automatic TypeScript type inference
- Migration files stored in `/migrations` directory
- Zod schemas derived from Drizzle tables for validation

### External Dependencies

**Google Services**
- Google Forms integration for form validation and submission
- Google Auth Library for API authentication (future implementation)
- Current implementation uses mock validation pending Google Forms API access
- Form field extraction from URLs using pattern matching

**Third-Party Libraries**
- Radix UI: Accessible component primitives (dialogs, dropdowns, tooltips, etc.)
- React Dropzone: Drag-and-drop file upload interface
- Date-fns: Date manipulation and formatting
- Nanoid: Unique ID generation
- XLSX (SheetJS): Spreadsheet parsing and manipulation

**Development Tools**
- Replit-specific plugins for development banner, error overlay, and code mapping
- ESBuild for production server bundling
- TSX for TypeScript execution in development

**Audio/Media**
- External audio CDN (freesound.org) for success notification sounds
- Preloaded audio for better user experience

### Authentication & Authorization

Currently not implemented - application operates without user authentication. Future implementation would likely use:
- Session-based authentication with express-session
- PostgreSQL session store via connect-pg-simple
- Google OAuth for user identity management

### Key Architectural Decisions

**Batch Processing Pattern**
- Records split into configurable batches (default: 100 records)
- Prevents overwhelming Google Forms servers
- Allows progress tracking and pause/resume capability
- Each batch tracked independently for error isolation

**Storage Abstraction**
- IStorage interface separates business logic from persistence
- Supports testing with in-memory storage
- Production uses PostgreSQL with minimal code changes
- Enables future Redis/caching layer addition

**Client-Server Communication**
- REST API with JSON payloads
- File uploads use multipart/form-data
- Real-time progress via polling (WebSocket upgrade possible)
- Error responses include descriptive messages for user feedback

**UI/UX Patterns**
- Splash screen for initial brand impression
- Multi-step workflow: Form validation → File upload → Batch configuration → Submission
- Modal popups for success feedback and completion reports
- Sound effects for positive reinforcement (toggleable)
- Responsive design with mobile breakpoint at 768px