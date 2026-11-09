import { create } from 'zustand';
import { DEFAULT_DELIVERY, DEFAULT_PICKUP, type Coordinates } from '../lib/maps';

export interface SelectedAddress {
  text: string;
  coordinates: Coordinates;
}

interface OrderAddressState {
  pickup: SelectedAddress;
  delivery: SelectedAddress;
  setPickup: (address: SelectedAddress) => void;
  setDelivery: (address: SelectedAddress) => void;
  reset: () => void;
}

const initialPickup: SelectedAddress = {
  text: DEFAULT_PICKUP.text,
  coordinates: { ...DEFAULT_PICKUP.coordinates },
};

const initialDelivery: SelectedAddress = {
  text: DEFAULT_DELIVERY.text,
  coordinates: { ...DEFAULT_DELIVERY.coordinates },
};

export const useOrderAddressStore = create<OrderAddressState>((set) => ({
  pickup: initialPickup,
  delivery: initialDelivery,
  setPickup: (pickup) => set({ pickup }),
  setDelivery: (delivery) => set({ delivery }),
  reset: () =>
    set({
      pickup: { ...initialPickup, coordinates: { ...initialPickup.coordinates } },
      delivery: { ...initialDelivery, coordinates: { ...initialDelivery.coordinates } },
    }),
}));
