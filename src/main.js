import * as THREE from './vendor/three.module.js'
import { GLTFLoader } from './vendor/GLTFLoader.js'
import { DRACOLoader } from './vendor/DRACOLoader.js'

const container = document.querySelector('.product-scene')
const canvas = document.querySelector('.product-scene__canvas')
const stage = document.querySelector('.flavour-stage')
const heroTitle = document.querySelector('.hero-title')
const heroRightCopy = document.querySelector('.hero-copy--right')
const appleSlices = document.querySelectorAll('.apple-slice')
const previousButton = document.querySelector('.flavour-control--prev')
const nextButton = document.querySelector('.flavour-control--next')
const storySection = document.querySelector('.story-section')
const nutritionSection = document.querySelector('.nutrition-section')
const nutrientCallouts = [...document.querySelectorAll('.nutrition-callout')]
const pageLoader = document.querySelector('.site-loader')
const siteScroll = document.querySelector('.site-scroll')
let resolveLoaderFinished
const loaderFinished = new Promise((resolve) => {
  resolveLoaderFinished = resolve
})

if (pageLoader) {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  window.scrollTo(0, 0)
  siteScroll?.scrollTo(0, 0)
  document.documentElement.dataset.loaderState = 'filling'

  const minimumFillTime = new Promise((resolve) => window.setTimeout(resolve, 2800))
  const sceneReady = new Promise((resolve) => {
    const startedAt = performance.now()
    const checkScene = () => {
      const state = container?.dataset.modelState
      if (state === 'ready' || container?.dataset.modelError === 'true' || performance.now() - startedAt > 10000) {
        resolve()
        return
      }
      window.setTimeout(checkScene, 60)
    }
    checkScene()
  })

  Promise.all([minimumFillTime, sceneReady]).then(() => {
    pageLoader.classList.add('is-complete')
    document.body.classList.remove('is-loading')
    document.documentElement.dataset.loaderState = 'complete'
    window.setTimeout(() => {
      pageLoader.remove()
      resolveLoaderFinished()
    }, 520)
  })
} else {
  resolveLoaderFinished()
}

const initialHeadingAnimationData = fetch('/heading-transition.json').then((response) => {
  if (!response.ok) throw new Error('Unable to load heading animation: ' + response.status)
  return response.json()
})
const clickHeadingAnimationData = fetch('/heading-click-transition.json').then((response) => {
  if (!response.ok) throw new Error('Unable to load click heading animation: ' + response.status)
  return response.json()
})
let headingAnimation = null
let headingRequest = 0

const renderFlavorHeading = async (flavor, autoplay = true, useClickAnimation = autoplay) => {
  if (!heroTitle || !window.lottie) return
  const request = ++headingRequest
  heroTitle.setAttribute('aria-label', flavor.title)

  try {
    const data = structuredClone(await (useClickAnimation ? clickHeadingAnimationData : initialHeadingAnimationData))
    if (request !== headingRequest) return
    if (useClickAnimation) data.layers = data.layers.slice(0, 1)

    const isNarrow = window.matchMedia('(max-width: 700px)').matches
    const bounds = heroTitle.getBoundingClientRect()
    const fontSize = Number.parseFloat(getComputedStyle(heroTitle).fontSize)
    const textLayers = data.layers.filter((layer) => layer.ty === 5)

    delete data.chars
    data.w = Math.max(1, Math.round(bounds.width))
    data.h = Math.max(1, Math.round(bounds.height))
    data.fonts.list = [{
      fName: 'GentySans',
      fFamily: 'Genty Sans',
      fStyle: 'Regular',
      ascent: 75,
    }]
    textLayers.forEach((textLayer) => {
      const textDocument = textLayer.t.d.k[0].s
      textDocument.t = isNarrow ? flavor.mobileTitle : flavor.title
      textDocument.f = 'GentySans'
      textDocument.fc = [1, 1, 1]
      textDocument.s = (fontSize * 0.82) / (useClickAnimation ? 1 : 0.33)
      textDocument.lh = textDocument.s * (isNarrow ? 0.82 : 0.9)
      textDocument.ls = 0
      textDocument.j = 2
      textLayer.ks.p.k = [data.w / 2, data.h * (isNarrow ? 0.64 : 0.82), 0]
      textLayer.ks.a.k = [0, 0, 0]
    })

    headingAnimation?.destroy()
    heroTitle.replaceChildren()
    headingAnimation = window.lottie.loadAnimation({
      container: heroTitle,
      renderer: 'svg',
      loop: false,
      autoplay,
      animationData: data,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })

    if (!autoplay) {
      headingAnimation.addEventListener('DOMLoaded', () => {
        headingAnimation.goToAndStop(headingAnimation.totalFrames - 1, true)
      })
    }
  } catch (error) {
    console.error('Unable to render the flavor heading animation.', error)
    heroTitle.textContent = flavor.title
  }
}

const initialFlavor = {
  title: 'Green Apple Juice',
  mobileTitle: 'Green Apple\rJuice',
}
renderFlavorHeading(initialFlavor, false)

if (container && canvas) {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 50)
  camera.position.set(0, 0.15, 12)

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1

  let storyScrollFrame = 0
  let updateStoryScene = () => {}

  scene.add(new THREE.HemisphereLight(0xffffff, 0x58743c, 1.35))

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4)
  keyLight.position.set(-4, 7, 8)
  scene.add(keyLight)

  const rimLight = new THREE.DirectionalLight(0xd9ffb2, 1.15)
  rimLight.position.set(5, 2, 5)
  scene.add(rimLight)

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('/draco/')
  loader.setDRACOLoader(dracoLoader)


  const render = () => renderer.render(scene, camera)

  let interactionReady = false
  let activeCan = null
  const touchFirstQuery = window.matchMedia('(hover: none), (pointer: coarse)')
  const isTouchFirstInteraction = () => touchFirstQuery.matches
  let orientationBaseBeta = null
  let orientationBaseGamma = null
  let orientationPitchTarget = 0
  let orientationYawTarget = 0

  window.addEventListener('deviceorientation', (event) => {
    if (!isTouchFirstInteraction() || event.beta == null || event.gamma == null) return
    if (orientationBaseBeta == null || orientationBaseGamma == null) {
      orientationBaseBeta = event.beta
      orientationBaseGamma = event.gamma
      return
    }

    orientationPitchTarget = THREE.MathUtils.clamp((event.beta - orientationBaseBeta) / 35, -1, 1) * 0.055
    orientationYawTarget = THREE.MathUtils.clamp((event.gamma - orientationBaseGamma) / 35, -1, 1) * 0.09
  }, { passive: true })

  window.addEventListener('orientationchange', () => {
    orientationBaseBeta = null
    orientationBaseGamma = null
    orientationPitchTarget = 0
    orientationYawTarget = 0
  }, { passive: true })

  const enableActiveCanDrag = () => {
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let dragging = false
    let startX = 0
    let startY = 0
    let startPitch = 0
    let startYaw = 0

    const hitsActiveCan = (event) => {
      if (!activeCan) return false
      const bounds = canvas.getBoundingClientRect()
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      return raycaster.intersectObject(activeCan, true).length > 0
    }

    const finishDrag = (event) => {
      if (!dragging) return
      dragging = false
      canvas.classList.remove('is-dragging')
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }

    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' || isTouchFirstInteraction()) return
      if (!interactionReady || !event.isPrimary || !hitsActiveCan(event)) return
      dragging = true
      startX = event.clientX
      startY = event.clientY
      startPitch = activeCan.rotation.x
      startYaw = activeCan.rotation.y
      canvas.setPointerCapture(event.pointerId)
      canvas.classList.add('is-dragging')
      event.preventDefault()
    })

    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch' || isTouchFirstInteraction()) return
      if (dragging && activeCan) {
        const yawTurn = ((event.clientX - startX) / canvas.clientWidth) * Math.PI * 2.4
        const pitchTurn = ((event.clientY - startY) / canvas.clientHeight) * Math.PI * 2.4
        activeCan.rotation.x = startPitch + pitchTurn
        activeCan.rotation.y = startYaw + yawTurn
        container.dataset.activePitch = activeCan.rotation.x.toFixed(2)
        container.dataset.activeYaw = activeCan.rotation.y.toFixed(2)
        render()
        event.preventDefault()
        return
      }

      if (interactionReady && event.pointerType !== 'touch') {
        canvas.classList.toggle('can-hover', hitsActiveCan(event))
      }
    })

    canvas.addEventListener('pointerup', finishDrag)
    canvas.addEventListener('pointercancel', finishDrag)
    canvas.addEventListener('pointerleave', () => {
      if (!dragging) canvas.classList.remove('can-hover')
    })
  }

  let resizeFrame = 0
  let renderedWidth = 0
  let renderedHeight = 0

  const resize = (force = false) => {
    const width = Math.round(container.clientWidth)
    const height = Math.round(container.clientHeight)
    if (width < 1 || height < 1) return
    if (!force && Math.abs(width - renderedWidth) < 2 && Math.abs(height - renderedHeight) < 2) return

    const viewHeight = 10
    const viewWidth = viewHeight * (width / height)

    renderedWidth = width
    renderedHeight = height
    camera.left = -viewWidth / 2
    camera.right = viewWidth / 2
    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    render()
  }

  const requestResize = () => {
    if (resizeFrame) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0
      resize()
    })
  }



  const prepareModel = (gltf, targetHeight, opacity = 1) => {
    const model = gltf.scene
    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())

    model.position.sub(center)
    model.traverse((child) => {
      if (!child.isMesh) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      const cloned = materials.map((material) => {
        const copy = material.clone()
        copy.userData.fullOpacity = material.opacity
        copy.transparent = opacity < 1 || copy.transparent
        copy.opacity = material.opacity * opacity
        copy.depthWrite = opacity >= 1
        copy.needsUpdate = true
        return copy
      })
      child.material = Array.isArray(child.material) ? cloned : cloned[0]
      child.frustumCulled = false
    })

    const pivot = new THREE.Group()
    pivot.add(model)
    const scale = targetHeight / size.y
    pivot.scale.setScalar(scale)
    scene.add(pivot)
    return pivot
  }



  const setModelOpacity = (model, opacity) => {
    model.traverse((child) => {
      if (!child.isMesh) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        const fullOpacity = material.userData.fullOpacity ?? 1
        const nextOpacity = fullOpacity * opacity
        const nextTransparent = opacity < 0.999
        const nextDepthWrite = opacity >= 0.999
        const renderStateChanged = material.transparent !== nextTransparent || material.depthWrite !== nextDepthWrite

        material.opacity = nextOpacity
        material.transparent = nextTransparent
        material.depthWrite = nextDepthWrite
        if (renderStateChanged) material.needsUpdate = true
      })
    })
  }

  const getModelOpacity = (model) => {
    let opacity = 1
    model.traverse((child) => {
      if (!child.isMesh || opacity !== 1) return
      const material = Array.isArray(child.material) ? child.material[0] : child.material
      const fullOpacity = material.userData.fullOpacity ?? 1
      opacity = material.opacity / fullOpacity
    })
    return opacity
  }

  const animateHeroCan = (can, target, restingYaw, entranceReady = Promise.resolve()) => {
    const startY = 7.2
    const startYaw = restingYaw - Math.PI * 2
    const duration = 1750
    const targetScale = can.scale.x

    can.position.set(target.x, startY, target.z)
    can.rotation.set(0.2, startYaw, -1.05)
    can.scale.setScalar(targetScale * 0.88)
    render()

    const tick = (now, startTime) => {
      if (isTouchFirstInteraction() && container.classList.contains('is-story-travelling')) return

      const raw = Math.max(0, Math.min(1, (now - startTime) / duration))
      container.dataset.animationProgress = raw.toFixed(2)
      const eased = 1 - Math.pow(1 - raw, 3)
      const settle = raw === 1 ? 1 : 1 + 1.65 * Math.pow(raw - 1, 3) + 0.65 * Math.pow(raw - 1, 2)

      can.position.y = THREE.MathUtils.lerp(startY, target.y, settle)
      can.rotation.x = THREE.MathUtils.lerp(0.2, 0.03, eased)
      can.rotation.y = THREE.MathUtils.lerp(startYaw, restingYaw, eased)
      can.rotation.z = THREE.MathUtils.lerp(-1.05, 0.035, eased)
      can.scale.setScalar(THREE.MathUtils.lerp(targetScale * 0.88, targetScale, eased))
      render()

      if (raw < 1) {
        requestAnimationFrame((nextFrame) => tick(nextFrame, startTime))
      } else {
        activeCan = can
        interactionReady = true
        container.dataset.activeYaw = can.rotation.y.toFixed(2)
        canvas.classList.add('is-ready')
      }
    }

    entranceReady.then(() => {
      const startTime = performance.now() + 120
      requestAnimationFrame((firstFrame) => tick(firstFrame, startTime))
    })
  }

  const loadModels = async () => {
    try {
      const [greenGltf, redGltf, purpleGltf] = await Promise.all([
        loader.loadAsync('/can.glb'),
        loader.loadAsync('/can-red.glb'),
        loader.loadAsync('/can-purple.glb'),
      ])

      const isNarrow = container.clientWidth <= 700
      const centerTarget = isNarrow
        ? { x: 0, y: -1.05, z: 0 }
        : { x: -0.55, y: -0.25, z: 0 }
      const rightTarget = isNarrow
        ? { x: 2.05, y: -0.35, z: -0.25 }
        : { x: 4.25, y: 0.15, z: -0.25 }
      const heroHeight = isNarrow ? 4.85 : 6.3
      const sideHeight = isNarrow ? 3.15 : 4.55
      const restingYaw = -0.8
      const sideYaw = -0.2
      const exitX = isNarrow ? -5.1 : -11.3

      const flavors = [
        { name: 'green', title: 'Green Apple Juice', mobileTitle: 'Green Apple\rJuice', rightCopy: 'Our most selling juice.', apple: '/apple.png', gltf: greenGltf },
        { name: 'red', title: 'Red Apple Juice', mobileTitle: 'Red Apple\rJuice', rightCopy: 'Your newly introduced model flavor.', apple: '/red-apple.png', gltf: redGltf },
        { name: 'purple', title: 'Blueberry Apple Juice', mobileTitle: 'Blueberry\rApple Juice', rightCopy: 'Their most selling for kids.', apple: '/purple apple.png', gltf: purpleGltf },
      ].map((flavor) => {
        const model = prepareModel(flavor.gltf, heroHeight)
        return {
          ...flavor,
          model,
          heroScale: model.scale.x,
          sideScale: model.scale.x * (sideHeight / heroHeight),
        }
      })

      let activeIndex = 0
      let switchingFlavor = false
      const nutrientRevealStarts = isNarrow
        ? [0.08, 0.22, 0.36, 0.50, 0.64, 0.78, 0.90]
        : [0.20, 0.30, 0.40, 0.50, 0.62, 0.72, 0.82]
      const nutrientRevealDuration = isNarrow ? 0.065 : 0.07
      const nutrientRevealWindows = nutrientRevealStarts.map((start) => [
        start,
        Math.min(1, start + nutrientRevealDuration),
      ])

      const smoothRange = (value, start, end) => {
        const progress = THREE.MathUtils.clamp((value - start) / Math.max(0.0001, end - start), 0, 1)
        return progress * progress * (3 - 2 * progress)
      }

      const updateNutritionReveal = (progress) => {
        if (!nutritionSection) return

        nutritionSection.dataset.progress = progress.toFixed(3)
        nutritionSection.style.setProperty('--nutrition-entry', smoothRange(progress, 0, 0.1).toFixed(3))
        const visibleCount = isNarrow ? 1 : 3

        nutrientCallouts.forEach((callout, index) => {
          const [start, end] = nutrientRevealWindows[index]
          const localProgress = THREE.MathUtils.clamp((progress - start) / (end - start), 0, 1)
          const pointProgress = smoothRange(localProgress, 0, 0.16)
          const lineProgress = smoothRange(localProgress, 0.16, 0.62)
          const cardProgress = smoothRange(localProgress, 0.62, 1)
          const exitStart = nutrientRevealStarts[index + visibleCount]
          const persistence = exitStart == null
            ? 1
            : 1 - smoothRange(progress, exitStart, Math.min(1, exitStart + (isNarrow ? 0.025 : 0.035)))

          callout.style.opacity = persistence.toFixed(3)
          callout.style.setProperty('--point-progress', pointProgress.toFixed(3))
          callout.style.setProperty('--line-progress', lineProgress.toFixed(3))
          callout.style.setProperty('--card-progress', cardProgress.toFixed(3))
          callout.style.setProperty('--card-opacity', cardProgress.toFixed(3))
        })
      }

      const targetForSlot = (flavor, slot) => {
        if (slot === 0) {
          return {
            ...centerTarget,
            scale: flavor.heroScale,
            pitch: 0.03,
            yaw: restingYaw,
            roll: 0.035,
            opacity: 1,
          }
        }
        if (slot === 1) {
          return {
            ...rightTarget,
            scale: flavor.sideScale,
            pitch: 0.02,
            yaw: sideYaw,
            roll: 0.06,
            opacity: 0.78,
          }
        }
        return {
          x: exitX,
          y: centerTarget.y,
          z: -0.1,
          scale: flavor.sideScale,
          pitch: 0.02,
          yaw: sideYaw - 0.45,
          roll: -0.16,
          opacity: 0.78,
        }
      }

      let mobileMotionFrame = 0
      let mobilePitch = 0
      let mobileYaw = 0
      let mobileMotionTime = performance.now()

      const updateMobileMotion = (now) => {
        mobileMotionFrame = 0
        if (!isTouchFirstInteraction()) return

        const delta = Math.min(0.05, Math.max(0, (now - mobileMotionTime) / 1000))
        mobileMotionTime = now
        const storyProgress = Number.parseFloat(container.dataset.storyProgress || '0')

        if (activeCan && interactionReady && !switchingFlavor && storyProgress <= 0.001) {
          const base = targetForSlot(flavors[activeIndex], 0)
          const seconds = now / 1000
          const pitchTarget = orientationPitchTarget + Math.sin(seconds * 1.1) * 0.018
          const yawTarget = orientationYawTarget + Math.sin(seconds * 0.72) * 0.026
          const damping = 1 - Math.exp(-6 * delta)

          mobilePitch = THREE.MathUtils.lerp(mobilePitch, pitchTarget, damping)
          mobileYaw = THREE.MathUtils.lerp(mobileYaw, yawTarget, damping)
          activeCan.rotation.x = base.pitch + mobilePitch
          activeCan.rotation.y = base.yaw + mobileYaw
          activeCan.rotation.z = base.roll + mobileYaw * 0.12
          container.dataset.mobilePitch = mobilePitch.toFixed(3)
          container.dataset.mobileYaw = mobileYaw.toFixed(3)
          render()
        }

        mobileMotionFrame = requestAnimationFrame(updateMobileMotion)
      }

      const updateInteractionMode = () => {
        container.dataset.interactionMode = isTouchFirstInteraction() ? 'mobile-passive' : 'desktop-drag'
        if (isTouchFirstInteraction()) {
          if (!mobileMotionFrame) {
            mobileMotionTime = performance.now()
            mobileMotionFrame = requestAnimationFrame(updateMobileMotion)
          }
          return
        }

        if (mobileMotionFrame) cancelAnimationFrame(mobileMotionFrame)
        mobileMotionFrame = 0
        mobilePitch = 0
        mobileYaw = 0
        if (activeCan && interactionReady) {
          const base = targetForSlot(flavors[activeIndex], 0)
          activeCan.rotation.set(base.pitch, base.yaw, base.roll)
          render()
        }
      }

      if ('addEventListener' in touchFirstQuery) {
        touchFirstQuery.addEventListener('change', updateInteractionMode)
      } else {
        touchFirstQuery.addListener(updateInteractionMode)
      }
      updateInteractionMode()

      const applyLayout = (targetActiveIndex) => {
        flavors.forEach((flavor, index) => {
          const slot = (index - targetActiveIndex + flavors.length) % flavors.length
          const target = targetForSlot(flavor, slot)
          flavor.model.position.set(target.x, target.y, target.z)
          flavor.model.rotation.set(target.pitch, target.yaw, target.roll)
          flavor.model.scale.setScalar(target.scale)
          setModelOpacity(flavor.model, target.opacity)
        })
      }

      const setControlsState = () => {
        if (previousButton) previousButton.disabled = switchingFlavor
        if (nextButton) nextButton.disabled = switchingFlavor
      }

      const completeActiveState = () => {
        activeCan = flavors[activeIndex].model
        interactionReady = true
        switchingFlavor = false
        container.dataset.activeFlavor = flavors[activeIndex].name
        container.dataset.activePitch = activeCan.rotation.x.toFixed(2)
        container.dataset.activeYaw = activeCan.rotation.y.toFixed(2)
        canvas.classList.add('is-ready')
        setControlsState()
        updateStoryScene()
      }

      let storyTravelling = false
      updateStoryScene = () => {
        if (!storySection || switchingFlavor) return

        const rect = storySection.getBoundingClientRect()
        const viewportHeight = isNarrow ? Math.max(1, storySection.clientHeight) : window.innerHeight
        const progress = THREE.MathUtils.clamp((viewportHeight - rect.top) / viewportHeight, 0, 1)
        const eased = progress * progress * (3 - 2 * progress)
        const nutritionRect = nutritionSection?.getBoundingClientRect()
        const nutritionViewportHeight = nutritionSection?.querySelector('.nutrition-sticky')?.clientHeight
          || window.innerHeight
        const nutritionTravel = nutritionSection
          ? Math.max(1, nutritionSection.offsetHeight - nutritionViewportHeight)
          : 1
        const nutritionActive = Boolean(nutritionRect && nutritionRect.top <= 0 && nutritionRect.bottom > 0)
        const nutritionProgress = nutritionActive
          ? THREE.MathUtils.clamp(-nutritionRect.top / nutritionTravel, 0, 1)
          : 0
        const handoffProgress = nutritionRect
          ? THREE.MathUtils.clamp((viewportHeight - nutritionRect.top) / viewportHeight, 0, 1)
          : 0
        const handoffEased = 1 - Math.pow(1 - handoffProgress, 2)
        const standProgress = THREE.MathUtils.clamp(handoffProgress / 0.42, 0, 1)
        const activeFlavor = flavors[activeIndex]
        const heroTarget = targetForSlot(activeFlavor, 0)
        const storyY = isNarrow ? -1.05 : -1
        const nutritionY = isNarrow ? storyY : storyY - 0.35
        const storyScale = activeFlavor.heroScale * 1.1
        const sectionScale = isNarrow ? heroTarget.scale : storyScale
        const handoffRotation = Math.PI * 2 * 0.25

        updateNutritionReveal(nutritionProgress)

        if (progress <= 0.001) {
          if (storyTravelling) {
            storyTravelling = false
            container.classList.remove('is-story-travelling')
            stage.appendChild(container)
            resize(true)
          }
          applyLayout(activeIndex)
          activeCan = activeFlavor.model
          interactionReady = true
          canvas.classList.add('is-ready')
          container.dataset.storyProgress = '0.00'
          container.dataset.handoffProgress = '0.000'
          container.dataset.nutritionProgress = '0.00'
          container.dataset.sceneSection = 'hero'
          render()
          return
        }

        if (!storyTravelling) {
          storyTravelling = true
          container.classList.add('is-story-travelling')
          document.body.appendChild(container)
          resize(true)
        }

        interactionReady = false
        canvas.classList.remove('is-ready', 'can-hover')
        const landingPageShift = progress * viewportHeight * (10 / container.clientHeight)
        flavors.forEach((flavor, index) => {
          const slot = (index - activeIndex + flavors.length) % flavors.length
          const target = targetForSlot(flavor, slot)
          if (index === activeIndex) {
            setModelOpacity(flavor.model, 1)
            return
          }
          flavor.model.position.set(target.x, target.y + landingPageShift, target.z)
          flavor.model.rotation.set(target.pitch, target.yaw, target.roll)
          flavor.model.scale.setScalar(target.scale)
          setModelOpacity(flavor.model, target.opacity)
        })

        if (nutritionActive) {
          const rotationProgress = THREE.MathUtils.clamp(nutritionProgress, 0, 1)
          const slowedRotation = 1 - Math.pow(1 - rotationProgress, 1.08)

          activeFlavor.model.position.set(
            0,
            nutritionY,
            0,
          )
          activeFlavor.model.rotation.set(
            Math.PI * 2 + heroTarget.pitch,
            restingYaw + handoffRotation + slowedRotation * (Math.PI * 2 - handoffRotation),
            0,
          )
          activeFlavor.model.scale.setScalar(sectionScale)
          container.dataset.sceneSection = 'nutrition'
        } else if (handoffProgress > 0) {
          activeFlavor.model.position.set(
            0,
            THREE.MathUtils.lerp(storyY, nutritionY, handoffEased),
            0,
          )
          activeFlavor.model.rotation.set(
            Math.PI * 2 + THREE.MathUtils.lerp(heroTarget.pitch + 0.16, heroTarget.pitch, standProgress),
            restingYaw + handoffProgress * handoffRotation,
            THREE.MathUtils.lerp(0.16, 0, standProgress),
          )
          activeFlavor.model.scale.setScalar(sectionScale)
          container.dataset.sceneSection = 'handoff'
        } else {
          activeFlavor.model.position.set(
            THREE.MathUtils.lerp(heroTarget.x, 0, eased),
            THREE.MathUtils.lerp(heroTarget.y, storyY, eased),
            0,
          )
          activeFlavor.model.rotation.set(
            heroTarget.pitch + eased * (Math.PI * 2 + 0.16),
            THREE.MathUtils.lerp(heroTarget.yaw, restingYaw, eased) + Math.sin(progress * Math.PI) * 0.32,
            THREE.MathUtils.lerp(heroTarget.roll, 0.16, eased),
          )
          const transitionScale = isNarrow
            ? heroTarget.scale
            : THREE.MathUtils.lerp(heroTarget.scale, storyScale, eased)
          activeFlavor.model.scale.setScalar(transitionScale)
          container.dataset.sceneSection = 'story'
        }
        container.dataset.storyProgress = progress.toFixed(2)
        container.dataset.handoffProgress = handoffProgress.toFixed(3)
        container.dataset.nutritionProgress = nutritionProgress.toFixed(3)
        render()
      }

      const requestStoryRender = () => {
        if (storyScrollFrame) return
        storyScrollFrame = requestAnimationFrame(() => {
          storyScrollFrame = 0
          updateStoryScene()
        })
      }
      window.addEventListener('scroll', requestStoryRender, { passive: true })
      siteScroll?.addEventListener('scroll', requestStoryRender, { passive: true })

      const switchFlavor = (direction) => {
        if (!interactionReady || switchingFlavor) return

        const targetIndex = (activeIndex + direction + flavors.length) % flavors.length
        switchingFlavor = true
        interactionReady = false
        activeCan = null
        canvas.classList.remove('is-ready', 'can-hover')
        setControlsState()

        if (stage) stage.dataset.flavor = flavors[targetIndex].name
        if (storySection) storySection.dataset.flavor = flavors[targetIndex].name
        if (nutritionSection) nutritionSection.dataset.flavor = flavors[targetIndex].name
        if (heroRightCopy) heroRightCopy.textContent = flavors[targetIndex].rightCopy

        renderFlavorHeading(
          flavors[targetIndex],
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          true,
        )
        appleSlices.forEach((apple) => {
          apple.src = flavors[targetIndex].apple
        })

        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1250
        const startTime = performance.now()
        const starts = flavors.map((flavor) => ({
          x: flavor.model.position.x,
          y: flavor.model.position.y,
          z: flavor.model.position.z,
          scale: flavor.model.scale.x,
          pitch: flavor.model.rotation.x,
          yaw: flavor.model.rotation.y,
          roll: flavor.model.rotation.z,
          opacity: getModelOpacity(flavor.model),
        }))
        const targets = flavors.map((flavor, index) => {
          const slot = (index - targetIndex + flavors.length) % flavors.length
          return targetForSlot(flavor, slot)
        })

        const tick = (now, startTime) => {
          const raw = Math.max(0, Math.min(1, (now - startTime) / duration))
          const spinEnd = 0.28
          const spinRaw = Math.min(1, raw / spinEnd)
          const spinEase = 1 - Math.pow(1 - spinRaw, 3)
          const slideRaw = Math.max(0, Math.min(1, (raw - spinEnd) / (1 - spinEnd)))
          const eased = slideRaw < 0.5
            ? 4 * slideRaw * slideRaw * slideRaw
            : 1 - Math.pow(-2 * slideRaw + 2, 3) / 2

          flavors.forEach((flavor, index) => {
            const start = starts[index]
            const target = targets[index]
            flavor.model.position.set(
              THREE.MathUtils.lerp(start.x, target.x, eased),
              THREE.MathUtils.lerp(start.y, target.y, eased),
              THREE.MathUtils.lerp(start.z, target.z, eased),
            )
            if (index === activeIndex && raw < spinEnd) {
              flavor.model.rotation.set(
                start.pitch + Math.sin(spinRaw * Math.PI) * 0.12,
                start.yaw + direction * Math.PI * 1.15 * spinEase,
                start.roll + direction * 0.1 * spinEase,
              )
            } else {
              const spunYaw = index === activeIndex ? start.yaw + direction * Math.PI * 1.15 : start.yaw
              const spunRoll = index === activeIndex ? start.roll + direction * 0.1 : start.roll
              flavor.model.rotation.set(
                THREE.MathUtils.lerp(start.pitch, target.pitch, eased),
                THREE.MathUtils.lerp(spunYaw, target.yaw, eased),
                THREE.MathUtils.lerp(spunRoll, target.roll, eased),
              )
            }
            flavor.model.scale.setScalar(THREE.MathUtils.lerp(start.scale, target.scale, eased))
            setModelOpacity(flavor.model, THREE.MathUtils.lerp(start.opacity, target.opacity, eased))
          })
          render()

          if (raw < 1) {
            requestAnimationFrame((nextFrame) => tick(nextFrame, startTime))
            return
          }

          activeIndex = targetIndex
          completeActiveState()
        }

        requestAnimationFrame((nextFrame) => tick(nextFrame, startTime))
      }

      previousButton?.addEventListener('click', () => switchFlavor(-1))
      nextButton?.addEventListener('click', () => switchFlavor(1))

      applyLayout(activeIndex)
      if (stage) stage.dataset.flavor = flavors[activeIndex].name
      if (storySection) storySection.dataset.flavor = flavors[activeIndex].name
      if (nutritionSection) nutritionSection.dataset.flavor = flavors[activeIndex].name
      if (heroRightCopy) heroRightCopy.textContent = flavors[activeIndex].rightCopy
      container.dataset.activeFlavor = flavors[activeIndex].name
      container.dataset.modelState = 'ready'
      setControlsState()
      render()

      const greenCan = flavors[0].model
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        loaderFinished.then(() => {
          completeActiveState()
          container.dataset.animationProgress = '1.00'
          render()
        })
      } else {
        animateHeroCan(greenCan, centerTarget, restingYaw, loaderFinished)
      }
    } catch (error) {
      console.error('Unable to load the Pixby can models.', error)
      container.dataset.modelError = 'true'
    }
  }
  enableActiveCanDrag()
  const observer = new ResizeObserver(requestResize)
  observer.observe(container)
  window.visualViewport?.addEventListener('resize', requestResize, { passive: true })
  window.addEventListener('orientationchange', requestResize, { passive: true })
  resize(true)
  loadModels()
}
