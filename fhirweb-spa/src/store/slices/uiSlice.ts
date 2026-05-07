import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type UserRole = 'psa' | 'clinician';

interface UiState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  notifications: Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
  }>;
  role: UserRole | null;
}

const initialState: UiState = {
  sidebarOpen: false,
  theme: 'light',
  notifications: [],
  role: (sessionStorage.getItem('userRole') as UserRole | null) ?? null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    addNotification: (
      state,
      action: PayloadAction<{
        type: 'info' | 'success' | 'warning' | 'error';
        message: string;
      }>,
    ) => {
      const id = Date.now().toString();
      state.notifications.push({
        id,
        ...action.payload,
      });
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== action.payload,
      );
    },
    setRole: (state, action: PayloadAction<UserRole>) => {
      state.role = action.payload;
      sessionStorage.setItem('userRole', action.payload);
    },
    clearRole: (state) => {
      state.role = null;
      sessionStorage.removeItem('userRole');
    },
  },
});

export const { toggleSidebar, setTheme, addNotification, removeNotification, setRole, clearRole } =
  uiSlice.actions;

export default uiSlice.reducer;
