import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { categories } from './listing'

type SellListingFormProps = {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

export default function SellListingForm({ isOpen, onClose, onCreated }: SellListingFormProps) {
  const [newTitle, setNewTitle] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCategory, setNewCategory] = useState('Textbooks')
  const [newCondition, setNewCondition] = useState('Good condition')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [newImage, setNewImage] = useState<File | null>(null)

  const imagePreview = useMemo(() => (newImage ? URL.createObjectURL(newImage) : null), [newImage])

  useEffect(() => {
    if (!imagePreview) return
    return () => URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Please choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setFormError('Image must be under 5 MB.')
      return
    }
    setFormError(null)
    setNewImage(file)
  }

  async function handleCreateListing() {
    if (submitting.current) return
    setFormError(null)
    if (!supabase) {
      setFormError('Supabase is not configured.')
      return
    }

    const price = Number(newPrice.replace('$', ''))
    if (
      !newTitle.trim() ||
      !newPrice.replace('$', '').trim() ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setFormError('Enter a title and a valid price.')
      return
    }

    submitting.current = true
    setSaving(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        setFormError('You need to sign in to post a listing.')
        return
      }

      let imagePath: string | null = null
      if (newImage) {
        const ext = newImage.name.split('.').pop()?.toLowerCase() || 'jpg'
        imagePath = `${userData.user.id}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(imagePath, newImage, { contentType: newImage.type, upsert: false })
        if (uploadError) {
          setFormError(uploadError.message)
          return
        }
      }

      const { error } = await supabase
        .from('listings')
        .insert({
          name: newTitle.trim(),
          price,
          category: newCategory,
          condition: newCondition,
          seller_id: userData.user.id,
          image_path: imagePath,
        })
        .select('id, name, price, category, condition, image_path, seller_id')
        .single()

      if (error) {
        setFormError(error.message)
        if (imagePath) {
          await supabase.storage
            .from('listing-images')
            .remove([imagePath])
            .catch(() => {})
        }
        return
      }

      onCreated()
      setNewTitle('')
      setNewPrice('')
      setNewImage(null)
      onClose()
    } catch {
      setFormError('Unable to post listing. Please try again.')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <div className="sell-modal" role="dialog" aria-modal="true" aria-labelledby="sell-title">
        <button
          className="modal-close"
          disabled={saving}
          onClick={() => onClose()}
          type="button"
          aria-label="Close"
        >
          ×
        </button>
        <p className="eyebrow">LIST SOMETHING NEW</p>
        <h2 id="sell-title">What are you selling?</h2>
        <p className="modal-copy">
          Add the basics now. You can fill in more details before posting.
        </p>
        <label>
          Photo
          <input disabled={saving} type="file" accept="image/*" onChange={handleImageChange} />
        </label>
        {imagePreview && (
          <img
            src={imagePreview}
            alt="Preview"
            style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }}
          />
        )}
        <label>
          Item title
          <input
            disabled={saving}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Mini fridge, desk lamp..."
          />
        </label>
        <label>
          Price
          <input
            disabled={saving}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="$ 0.00"
            inputMode="decimal"
          />
        </label>
        <label>
          Category
          <select
            disabled={saving}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          >
            {categories
              .filter((c) => c !== 'All listings')
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </label>
        <label>
          Condition
          <select
            disabled={saving}
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
          >
            <option>New</option>
            <option>Like new</option>
            <option>Good condition</option>
            <option>Fair</option>
          </select>
        </label>
        {formError && <p role="alert">{formError}</p>}
        <div className="modal-actions">
          <button
            className="cancel-button"
            disabled={saving}
            type="button"
            onClick={() => onClose()}
          >
            Cancel
          </button>
          <button
            className="sell-button"
            type="button"
            onClick={handleCreateListing}
            disabled={saving}
          >
            {saving ? 'Posting…' : 'Post listing'} <span></span>
          </button>
        </div>
      </div>
    </div>
  )
}
