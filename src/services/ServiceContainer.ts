import { IAuthService } from './interfaces/IAuthService';
import { IFerryService } from './interfaces/IFerryService';
import { ISiteService } from './interfaces/ISiteService';
import { ITodoService } from './interfaces/ITodoService';
import { MockAuthService } from './mock/MockAuthService';
import { RayfinAuthService } from './rayfin/RayfinAuthService';
import { RayfinClientService } from './rayfin/RayfinClientService';
import { RayfinFerryService } from './rayfin/RayfinFerryService';
import { RayfinSiteService } from './rayfin/RayfinSiteService';
import { RayfinTodoService } from './rayfin/RayfinTodoService';

function isLocalBackend(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export class ServiceContainer {
  private static instance: ServiceContainer | null = null;

  public readonly authService: IAuthService;
  public readonly todoService: ITodoService;
  public readonly siteService: ISiteService;
  public readonly ferryService: IFerryService;

  private constructor(
    authService: IAuthService,
    todoService: ITodoService,
    siteService: ISiteService,
    ferryService: IFerryService
  ) {
    this.authService = authService;
    this.todoService = todoService;
    this.siteService = siteService;
    this.ferryService = ferryService;
  }

  static create(): ServiceContainer {
    if (!ServiceContainer.instance) {
      const apiUrl =
        import.meta.env.VITE_RAYFIN_API_URL || 'http://localhost:5168';
      const localDev = isLocalBackend(apiUrl);

      const publishableKey = import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY;

      if (!publishableKey && !localDev) {
        throw new Error(
          'VITE_RAYFIN_PUBLISHABLE_KEY environment variable is required'
        );
      }

      const projectId = import.meta.env.VITE_FABRIC_ITEM_ID;

      const rayfinClientService = RayfinClientService.getInstance();
      rayfinClientService.initialize(
        apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`,
        publishableKey ?? 'local-dev-key',
        projectId
      );

      let authService: IAuthService;

      if (localDev) {
        authService = new MockAuthService();
      } else {
        const workspaceId = import.meta.env.VITE_FABRIC_WORKSPACE_ID;
        const fabricPortalUrl = import.meta.env.VITE_FABRIC_PORTAL_URL;

        authService = new RayfinAuthService({
          workspaceId: workspaceId || '',
          projectId: projectId || '',
          fabricPortalUrl: fabricPortalUrl || '',
        });
      }

      ServiceContainer.instance = new ServiceContainer(
        authService,
        new RayfinTodoService(),
        new RayfinSiteService(),
        new RayfinFerryService()
      );
    }

    return ServiceContainer.instance;
  }

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      throw new Error('ServiceContainer not initialized. Call create() first.');
    }
    return ServiceContainer.instance;
  }

  static reset(): void {
    ServiceContainer.instance = null;
    RayfinClientService.reset();
  }
}
