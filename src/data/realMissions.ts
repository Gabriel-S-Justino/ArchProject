// Real NASA Mars orbiters the player's design is compared with (factual comparisons only).
import type { RealMission } from '@/game/types'

export const REAL_MISSIONS: RealMission[] = [
  {
    id: 'mro',
    name: 'Mars Reconnaissance Orbiter',
    launchDate: '2005-08-12',
    vehicle: 'Atlas V 401',
    launchMassKg: 2180,
    costM: 720,
    arrivalDate: '2006-03-10',
    dryMassKg: 1031,
    moiDvMs: 1015,
    source:
      'JPL MRO launch press kit (Aug 2005): launch 12 Aug 2005 from LC-41 on Atlas V 401, 2,180 kg at launch (1,031 kg dry), about $720M total ($450M spacecraft and instruments, $90M launch, $180M operations, science and relay over 5.5 years). Orbit insertion 10 Mar 2006; MOI Δv 1,015 m/s (NASA PDS MRO mission catalog).',
    url: 'https://www.jpl.nasa.gov/news/press_kits/mro-launch-Aug05.pdf',
  },
  {
    id: 'maven',
    name: 'MAVEN',
    launchDate: '2013-11-18',
    vehicle: 'Atlas V 401',
    launchMassKg: 2454,
    costM: 671,
    arrivalDate: '2014-09-22',
    dryMassKg: 809,
    moiDvMs: 1233,
    launchC3: 12.07,
    source:
      'NASA MAVEN launch press kit (Nov 2013): launch 18 Nov 2013 from SLC-41 on Atlas V 401, 2,454 kg at launch (809 kg dry), $671M total life-cycle cost. Orbit insertion 22 Sep 2014; MOI Δv ≈ 1,233 m/s and launch C3 12.07 km²/s² at period open (NTRS 20160000802).',
    url: 'http://lasp.colorado.edu/maven/files/2011/02/MAVEN_PressKit_Final.pdf',
  },
]
