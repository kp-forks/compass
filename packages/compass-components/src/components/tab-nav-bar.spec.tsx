import React from 'react';
import {
  fireEvent,
  render,
  cleanup,
  screen,
} from '@mongodb-js/testing-library-compass';
import { expect } from 'chai';
import sinon from 'sinon';

import { TabNavBar } from './tab-nav-bar';

function MockElement({ number }: { number: number }) {
  return <p>test-element-{number}</p>;
}

describe('TabNavBar Component', function () {
  let onTabClickedSpy: sinon.SinonSpy;

  afterEach(cleanup);

  describe('when rendered with tabs', function () {
    beforeEach(function () {
      const tabs = [
        {
          name: 'one',
          title: 'one',
          content: <MockElement key={1} number={1} />,
        },
        {
          name: 'two',
          title: 'two',
          content: <MockElement key={2} number={2} />,
        },
        {
          name: 'three',
          title: 'three',
          content: <MockElement key={3} number={3} />,
        },
        {
          name: 'four',
          title: <p key={'four'}>four</p>,
          content: <MockElement key={4} number={4} />,
        },
      ];
      onTabClickedSpy = sinon.spy();
      render(
        <TabNavBar
          tabs={tabs}
          aria-label="Test tabs label"
          onTabClicked={onTabClickedSpy}
          activeTabIndex={2}
        />
      );
    });

    it('should render the tabs', function () {
      expect(screen.getByText('one')).to.be.visible;
      expect(screen.getByText('two')).to.be.visible;
      expect(screen.getByText('three')).to.be.visible;
      expect(screen.getByText('four')).to.be.visible;
    });

    it('should not render the non-selected tab contents', function () {
      expect(screen.queryByText('test-element-1')).to.not.exist;
      expect(screen.queryByText('test-element-2')).to.not.exist;
      expect(screen.queryByText('test-element-4')).to.not.exist;
    });

    it('should render the selected tab contents', function () {
      expect(screen.getByText('test-element-3')).to.be.visible;
    });

    it('should call onTabClicked with the correct index when a tab is clicked', function () {
      fireEvent(
        screen.getByText('two'),
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
        })
      );

      expect(onTabClickedSpy.calledOnce).to.equal(true);
      expect(onTabClickedSpy.firstCall.args[0]).to.equal(1);
    });

    it('should render aria-label for the tabs', function () {
      expect(screen.getByLabelText('Test tabs label')).to.be.visible;
    });
  });
});
