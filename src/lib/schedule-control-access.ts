import { SCHEDULE_CITY_OPTIONS, scheduleFrontOptionsForCity } from "./types";
export const controlCities = SCHEDULE_CITY_OPTIONS.filter((city) =>
  scheduleFrontOptionsForCity(city.value).some((front) => front.value === "controle-operacional"),
);
export function controlAccessRequestCity(initialCity: string): string {
  return (
    controlCities.find((city) => city.value === initialCity)?.value ?? controlCities[0]?.value ?? ""
  );
}
