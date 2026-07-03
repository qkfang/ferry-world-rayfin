# Sydney Harbour Ferry World

A Rayfin app with a **voxel frontend** that simulates a ferry cruising Sydney
Harbour past its famous tourism sites. Built with three.js, Tailwind CSS,
shadcn UI components, and Fabric Entra authentication.

The harbour route and voxel landmarks are powered by a Rayfin `TourismSite`
data entity. A voxel ferry loops the harbour, calling at each stop (Circular
Quay, the Opera House, the Harbour Bridge, Taronga Zoo, Manly, and more) while
the HUD highlights the site it is currently cruising past.

Inspired by the isometric voxel style of the
[zava-claims-agent](https://github.com/qkfang/zava-claims-agent/tree/main/src/frontend)
demo (which uses Babylon.js); this app renders the scene with three.js.

## Features

- **Voxel harbour scene**: An isometric three.js scene with a water plane,
  voxel landmarks, and an animated ferry that loops the tourism route
- **Rayfin-backed data**: Tourism sites are stored in the `TourismSite` entity
  and seeded on first load; the scene falls back to built-in sites if no
  backend is available yet
- **Live HUD**: A route list highlights the stop the ferry is currently at
- **Radix UI Components**: Production-ready components styled with Tailwind CSS v4
- **Production-First Workflow**: Deploy first, develop against Fabric backend
- **Authentication**: Fabric Entra SSO in production; mock email/password for local dev

## Getting Started

### Prerequisites

- Node.js 20+
- Docker Desktop (for local backend)

### Deploy to Fabric (Primary Workflow)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Deploy the app to Fabric and start the local dev server:

   ```bash
   npm run dev
   ```

3. Open your browser to the Vite dev server URL shown in the terminal.

## Authentication

Authentication is enabled by default.
In production (after `rayfin up`), users sign in via Fabric Entra SSO.
For local development (`npm run dev`), a mock auth service auto-signs in with a configurable email/password against the local backend.

The `ServiceContainer` auto-detects the backend URL and selects the right auth service:

- **Localhost** → `MockAuthService` (email/password, auto-creates accounts)
- **Production** → `RayfinAuthService` → `RayfinFabricAuthService` (Fabric Entra)

Key auth files:

| File | Purpose |
| --- | --- |
| `rayfin/rayfin.yml` | Auth service configuration (auth, Fabric, password enabled) |
| `rayfin/data/Todo.ts` | `@role` decorator with `user_id` policy |
| `src/hooks/AuthContext.tsx` | Auth state management (React context) |
| `src/components/AuthPage.tsx` | Sign-in page |
| `src/components/MockSignInDialog.tsx` | Local dev mock sign-in dialog |
| `src/pages/AuthCallback.tsx` | Fabric Entra OAuth callback |
| `src/services/ServiceContainer.ts` | Auth service auto-selection |
| `src/services/rayfin/RayfinAuthService.ts` | Fabric auth service |
| `src/services/rayfin/RayfinFabricAuthService.ts` | Fabric Entra provider |
| `src/services/mock/MockAuthService.ts` | Local dev mock auth |
| `src/services/interfaces/IAuthService.ts` | Auth service contract |

## Project Structure

```text
getting-started-auth/
├── rayfin/
│   ├── data/
│   │   ├── Todo.ts            # Todo entity with @role policy and user_id
│   │   └── schema.ts          # Schema export for type safety
│   └── rayfin.yml             # Rayfin configuration (auth and data enabled)
├── src/
│   ├── components/
│   │   ├── ui/                # Radix-based UI components (shadcn)
│   │   ├── AuthPage.tsx       # Fabric sign-in page
│   │   ├── MockSignInDialog.tsx # Local dev mock sign-in dialog
│   │   ├── TodoForm.tsx       # New task input
│   │   ├── TodoItem.tsx       # Individual task with checkbox and delete
│   │   └── TodoList.tsx       # Todo list container
│   ├── hooks/
│   │   ├── AuthContext.tsx    # Authentication state management
│   │   ├── use-mobile.ts     # Mobile breakpoint hook
│   │   └── useTodos.ts       # Todo CRUD operations hook
│   ├── pages/
│   │   ├── AuthCallback.tsx   # Fabric Entra OAuth callback
│   │   └── Dashboard.tsx      # Main dashboard with milestones and todos
│   ├── services/
│   │   ├── interfaces/
│   │   │   ├── IAuthService.ts    # Auth service contract
│   │   │   └── ITodoService.ts    # Todo service contract
│   │   ├── mock/
│   │   │   └── MockAuthService.ts # Local dev mock auth
│   │   ├── rayfin/
│   │   │   ├── RayfinAuthService.ts       # Fabric auth service
│   │   │   ├── RayfinFabricAuthService.ts # Fabric Entra provider
│   │   │   ├── RayfinClientService.ts     # Rayfin client singleton
│   │   │   └── RayfinTodoService.ts       # Todo data operations
│   │   └── ServiceContainer.ts  # Service initialization with auth-mode detection
│   ├── ErrorFallback.tsx      # Error boundary fallback UI
│   ├── App.tsx                # Router with protected and public routes
│   └── main.tsx               # Entry point with AuthProvider
└── package.json
```

## Data Model

Two Rayfin entities back the app.

`TourismSite` holds the harbour route and voxel landmark data. It is shared
reference data readable and seedable by any authenticated user:

```typescript
@entity()
@authenticated('*')
export class TourismSite {
  @uuid() id!: string;
  @text({ min: 1, max: 100 }) name!: string;
  @text({ max: 300 }) description!: string;
  @text({ max: 40 }) category!: string;
  @int() routeOrder!: number;
  @decimal() posX!: number;
  @decimal() posZ!: number;
  @text({ max: 20 }) color!: string;
}
```

`Todo` remains from the starter template and uses a role-based access policy so
each authenticated user can only access their own todos:

```typescript
@entity()
@role('authenticated', '*', {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class Todo {
  @uuid() id!: string;
  @text({ min: 1, max: 100 }) title!: string;
  @boolean() isCompleted!: boolean;
  @date() createdAt!: Date;
  @text() user_id!: string;
}
```

## Voxel Harbour Scene

The 3D scene is rendered with [three.js](https://threejs.org/) in an isometric
voxel style.

| File | Purpose |
| --- | --- |
| `src/components/HarbourScene.tsx` | three.js scene: water, voxel landmarks, animated ferry |
| `src/components/SiteList.tsx` | HUD list of ferry-route stops |
| `src/data/harbourSites.ts` | Default Sydney Harbour sites (seed + in-memory fallback) |
| `src/hooks/useSites.ts` | Loads/seeds `TourismSite` records |
| `src/pages/Dashboard.tsx` | Ferry-world view combining the scene and HUD |
| `rayfin/data/TourismSite.ts` | `TourismSite` entity |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev:fabric` | Start dev server against Fabric backend |
| `npm run dev` | Deploy app to Fabric and start local dev server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |
| `npm run rayfin:up` | Deploy app to Fabric (no local dev server) |
| `npm run rayfin:db` | Generate and apply database schema |

## Environment Variables

All Rayfin environment variables live in `rayfin/.env` using the `RAYFIN_PUBLIC_*` prefix.
The `predev` hook runs `rayfin env --framework vite` to generate `.env.local` with Vite-compatible names.

| Source (`rayfin/.env`) | Vite variable (`.env.local`) | Description | Default |
| --- | --- | --- | --- |
| `RAYFIN_PUBLIC_API_URL` | `VITE_RAYFIN_API_URL` | Rayfin backend URL | `http://localhost:5168` |
| `RAYFIN_PUBLIC_PUBLISHABLE_KEY` | `VITE_RAYFIN_PUBLISHABLE_KEY` | Rayfin publishable key | (generated on dev) |
| `RAYFIN_PUBLIC_ITEM_ID` | `VITE_FABRIC_ITEM_ID` | Fabric item/project ID (written by `rayfin up`) | -- |
| `RAYFIN_PUBLIC_WORKSPACE_ID` | `VITE_FABRIC_WORKSPACE_ID` | Fabric workspace ID for auth | -- |
| `RAYFIN_PUBLIC_PORTAL_URL` | `VITE_FABRIC_PORTAL_URL` | Fabric portal URL for auth | -- |

Deployment metadata (including hosting URL) is stored in `rayfin/.deployments.json`.
Use `rayfin up list` to view all deployments.

## Next Steps

For a more advanced example with categories, relationships, profile images, and dual mock/Rayfin service modes, see the [todo-app](../todo-app/) sample.

## License

See the [LICENSE](LICENSE) file for details.
