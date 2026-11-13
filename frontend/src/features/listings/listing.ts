import { supabase } from '../../lib/supabase'

export type Listing = {
  id: number
  sellerId: string
  title: string
  price: string
  category: string
  image: string
  condition: string
  seller: string
}

export const categories = [
  'All listings',
  'Textbooks',
  'Electronics',
  'Furniture',
  'Clothing',
  'Tickets',
]

export type ListingRow = {
  id: number
  seller_id: string
  name: string
  price: number
  category: string
  condition: string
  image_path: string | null
  sellerName?: string
}

const PLACEHOLDER_IMAGE = 'https://placehold.co/900x700?text=No+photo'

export function toListing(row: ListingRow): Listing {
  const imageUrl =
    row.image_path && supabase
      ? supabase.storage.from('listing-images').getPublicUrl(row.image_path).data.publicUrl
      : PLACEHOLDER_IMAGE
  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.name,
    price: `$${Number(row.price).toFixed(2).replace(/\.00$/, '')}`,
    category: row.category,
    condition: row.condition ?? 'Good condition',
    image: imageUrl,
    seller: row.sellerName?.trim() || 'RPI student',
  }
}
