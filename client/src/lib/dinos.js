// Profile mascots. A user's pick is stored as `dino` in their auth user metadata (no database change).
import wondering from '@/assets/dinos/wondering.png'
import hearts from '@/assets/dinos/hearts.png'
import gift from '@/assets/dinos/gift.png'
import cheer from '@/assets/dinos/cheer.png'
import scarf from '@/assets/dinos/scarf.png'
import berry from '@/assets/dinos/berry.png'
import flower from '@/assets/dinos/flower.png'
import sad from '@/assets/dinos/sad.png'
import pyjamas from '@/assets/dinos/pyjamas.png'
import laptop from '@/assets/dinos/laptop.png'
import donut from '@/assets/dinos/donut.png'

export const DINOS = [
  { id: 'cheer', label: 'Cheerful', src: cheer },
  { id: 'hearts', label: 'Loving', src: hearts },
  { id: 'gift', label: 'Gift giver', src: gift },
  { id: 'flower', label: 'Flower fan', src: flower },
  { id: 'berry', label: 'Berry snacker', src: berry },
  { id: 'donut', label: 'Donut lover', src: donut },
  { id: 'scarf', label: 'Cosy scarf', src: scarf },
  { id: 'pyjamas', label: 'Sleepover', src: pyjamas },
  { id: 'laptop', label: 'Hard at work', src: laptop },
  { id: 'wondering', label: 'Curious', src: wondering },
  { id: 'sad', label: 'Needs a hug', src: sad },
]

export const dinoById = id => DINOS.find(dino => dino.id === id) || null
