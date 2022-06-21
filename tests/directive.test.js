import facade from '../src/directive'
import { CONFIG_KEY } from '../src/core'
import { mount, shallowMount } from '@vue/test-utils'

describe('Directive', () => {
  let wrapper
  const inputListener = jest.fn()

  const buildWrapper = ({ template, mask = '##.##', modifiers, value = '', ...rest } = {}) => {
    const directive = modifiers ? `v-facade.${modifiers}` : 'v-facade'
    if (!template) template = `<input ${directive}="mask" value="${value}" @input="inputListener" />`

    const component = {
      template,
      directives: { facade },
      methods: { inputListener },
      data() {
        return { mask, flag: true }
      }
    }

    wrapper = shallowMount(component, { ...rest })
  }

  afterEach(() => {
    jest.restoreAllMocks()
    wrapper && wrapper.destroy()
  })

  test('Initial state on mount', () => {
    buildWrapper({ value: 1234 })

    expect(wrapper.element.value).toBe('12.34')
    expect(inputListener).toBeCalledTimes(1)
    expect(wrapper.element[CONFIG_KEY]).toBeDefined()
  })

  test('Update the config when mask changes', async () => {
    const mask1 = '###.#'
    const mask2 = '#.###'

    buildWrapper({ mask: mask1 })

    expect(wrapper.element[CONFIG_KEY].config.mask).toBe(mask1)
    await wrapper.setData({ mask: mask2 })
    expect(wrapper.element[CONFIG_KEY].config.mask).toBe(mask2)
  })

  test('Should attach to the first input of parent wrapper', () => {
    const template = `<div v-facade="mask">
        <input id="first" value="3344" />
        <input id="second" value="3344" />
      </div>`

    buildWrapper({ template, mask: '##.##' })
    expect(wrapper.find('#first').element.value).toBe('33.44')
    expect(wrapper.find('#second').element.value).toBe('3344')
  })

  test('Removing a masked input from the DOM should not impact other masked inputs in the same container', async () => {
    const template = `<div id='owner'>
        <input v-facade="mask" id="first" />
        <input v-if="flag" v-facade="mask" id="second" />
      </div>`

    buildWrapper({ template, mask: '##.##' })

    wrapper.find('#first').setValue('1111')
    wrapper.find('#second').setValue('1111')

    expect(wrapper.find('#first').element.value).toBe('11.11')
    expect(wrapper.find('#second').element.value).toBe('11.11')

    // remove #second input from DOM, triggering directive unbind
    await wrapper.setData({ flag: false })
    expect(wrapper.find('#second').exists()).toBeFalsy()

    // ensure #first input is still being masked
    wrapper.find('#first').setValue('1122')
    expect(wrapper.find('#first').element.value).toBe('11.22')
  })

  test('Should update element value on input', async () => {
    buildWrapper({ value: 1234 })
    expect(wrapper.element.value).toBe('12.34')

    wrapper.element.value = '1122'
    wrapper.find('input').trigger('input')

    expect(wrapper.element.value).toBe('11.22')
    expect(wrapper.element.unmaskedValue).toBe('1122')
  })

  test('Should update element value when mounted', async () => {
    const innerComponent = {
      name: 'm-input',
      template: '<input ref="innerComponent" @input="handleInput" />',
      methods: {
        handleInput(e) {
          this.internalValue = e.target.value
          this.$emit('input', e.target.value)
        },
        updateInputValue(value) {
          this.$refs.innerComponent.value = value
        }
      },
      watch: {
        value(newVal) {
          this.internalValue = newVal
          if (this.$refs.innerComponent) this.updateInputValue(this.internalValue)
        }
      },
      mounted: function() {
        this.updateInputValue(this.internalValue)
      },
      props: {
        value: String
      },
      data() {
        return {
          internalValue: this.value
        }
      }
    }

    const outerComponent = {
      template: "<m-input ref='outerComponent' v-facade='mask' :value='internalValue' @input='handleInput' />",
      directives: { facade },
      components: { 'm-input': innerComponent },
      watch: {
        value() {
          this.internalValue = this.value
        }
      },
      methods: {
        handleInput(newVal) {
          this.internalValue = newVal
        }
      },
      data() {
        return {
          value: '1234',
          internalValue: '1234',
          mask: '##.##'
        }
      }
    }

    const wrapper = mount(outerComponent)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.$refs.outerComponent.$refs.innerComponent.value).toBe('12.34')

    wrapper.vm.value = ''
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.$refs.outerComponent.$refs.innerComponent.value).toBe('')
  })

  test('Should honor short modifier', async () => {
    buildWrapper({
      template: `<input v-facade.short="mask" value="12" @input="inputListener" />`
    })
    expect(wrapper.element.value).toBe('12')

    wrapper.element.value = '1234'
    wrapper.find('input').trigger('input')

    expect(wrapper.element.value).toBe('12.34')
    expect(wrapper.element.unmaskedValue).toBe('1234')
  })

  test('Should not update the cursor position if not the active element', () => {
    buildWrapper({ value: 'ABCDE' })

    jest.spyOn(wrapper.element, 'setSelectionRange')
    expect(wrapper.element.setSelectionRange).not.toBeCalled()
  })

  describe('Directive Modifiers', () => {
    test('Should honor short modifier', async () => {
      buildWrapper({ modifiers: 'short', value: '12' })
      expect(wrapper.element.value).toBe('12')

      wrapper.element.value = '1234'
      wrapper.find('input').trigger('input')

      expect(wrapper.element.value).toBe('12.34')
      expect(wrapper.element.unmaskedValue).toBe('1234')
    })

    test('Should honor prefill modifier', async () => {
      buildWrapper({ modifiers: 'prefill', mask: '+1 ###', value: '' })
      expect(wrapper.element.value).toBe('+1 ')

      wrapper.element.value = '777'
      wrapper.find('input').trigger('input')

      expect(wrapper.element.value).toBe('+1 777')
      expect(wrapper.element.unmaskedValue).toBe('777')
    })
  })

  describe.each([['insertText'], [undefined]])('Cursor updates (inputType = %s)', (inputType) => {
    let element

    beforeEach(() => {
      buildWrapper({ mask: 'AAA-###-', attachToDocument: true })

      element = wrapper.element

      jest.spyOn(element, 'setSelectionRange')
      element.focus()
    })

    // We are using a pipe "|" to visualize where the cursor is
    test('Should stay next to the char just inserted', () => {
      element.value = 'ABC1|23'
      const cursorPos = element.value.indexOf('|')
      const newCursorPos = cursorPos + 1 // one new char inserted before

      element.selectionEnd = cursorPos
      wrapper.find('input').trigger('input', { inputType })

      expect(wrapper.element.setSelectionRange).toBeCalledWith(newCursorPos, newCursorPos)
    })

    test('Should stay next to the char just inserted', () => {
      element.value = 'ABC1|23'
      const cursorPos = element.value.indexOf('|')
      const newCursorPos = cursorPos + 1 // one new char inserted before

      element.selectionEnd = cursorPos
      wrapper.find('input').trigger('input', { inputType })

      expect(wrapper.element.setSelectionRange).toBeCalledWith(newCursorPos, newCursorPos)
    })

    test('Should remain at the end if adding new char at the end', async () => {
      element.value = 'ABC123'
      const cursorPos = element.value.length
      const newCursorPos = cursorPos + 2 // two new characters after masking

      element.selectionEnd = cursorPos
      wrapper.find('input').trigger('input', { inputType })

      expect(wrapper.element.setSelectionRange).toBeCalledWith(newCursorPos, newCursorPos)
    })

    test('Should keep cursor at its current position when entering a bad char', async () => {
      element.value = 'ABC-1J|2'
      const cursorPos = element.value.indexOf('|')
      const newCursorPos = cursorPos - 1 // needs to move back as 'j' is not an allowed char

      element.selectionEnd = cursorPos
      wrapper.find('input').trigger('input', { inputType })

      expect(wrapper.element.setSelectionRange).toBeCalledWith(newCursorPos, newCursorPos)
    })

    test('should not reset cursor if no mask is given', async () => {
      buildWrapper({ mask: '', attachToDocument: true })
      element = wrapper.element
      jest.spyOn(element, 'setSelectionRange')
      element.focus()
      element.value = 'ABC-1J|2'
      const cursorPos = element.value.indexOf('|')
      element.selectionEnd = cursorPos
      wrapper.find('input').trigger('input', { inputType })
      expect(wrapper.element.setSelectionRange).not.toBeCalled()
    })
  })
})
