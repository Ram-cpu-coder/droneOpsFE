import { io } from "socket.io-client";
import { API_BASE_URL } from "./apiClient";

const getSocketBaseUrl = () => API_BASE_URL.replace(/\/api\/v\d+\/?$/, "");

let socket;

export const getRealtimeSocket = () => {
  if (!socket) {
    socket = io(getSocketBaseUrl(), {
      autoConnect: true,
      transports: ["websocket", "polling"]
    });
  }

  return socket;
};
