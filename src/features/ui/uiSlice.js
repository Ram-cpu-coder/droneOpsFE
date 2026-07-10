import { createSlice } from "@reduxjs/toolkit";

const getInitialThemeMode = () => {
  if (typeof window === "undefined") return "default";
  return window.localStorage.getItem("droneops-theme-mode") ?? "default";
};

const uiSlice = createSlice({
  name: "ui",
  initialState: {
    activeRoute: "dashboard",
    globalSearch: "",
    pendingRouteAction: null,
    themeMode: getInitialThemeMode()
  },
  reducers: {
    routeChanged(state, action) {
      state.activeRoute = action.payload;
    },
    searchChanged(state, action) {
      state.globalSearch = action.payload;
    },
    themeModeChanged(state, action) {
      state.themeMode = action.payload;
    },
    routeActionRequested(state, action) {
      state.pendingRouteAction = action.payload;
    },
    routeActionCleared(state) {
      state.pendingRouteAction = null;
    },
    uiReset(state) {
      state.activeRoute = "dashboard";
      state.globalSearch = "";
      state.pendingRouteAction = null;
    }
  }
});

export const { routeActionCleared, routeActionRequested, routeChanged, searchChanged, themeModeChanged, uiReset } = uiSlice.actions;

export default uiSlice.reducer;
